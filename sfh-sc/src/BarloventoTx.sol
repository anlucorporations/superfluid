// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title BarloventoTx — Super Token propio con CFA simplificado (decisión D1/Opción B)
/// @notice Tokens de prueba SIN respaldo ni valor (LICENSE.md).
/// @dev H1 (SFhostpot): ReentrancyGuard + CEI (D34/D40) y gate de apertura de 1 h (D54).
///      MODELO CONTABLE V3 (auditoría de código V2, hallazgos CRÍTICO/ALTA resueltos):
///      el devengo acreditado en earnedUnclaimed es un PASIVO DENTRO de
///      realBalanceOf[sender] (modelo de reserva). claimSettled transfiere real del
///      emisor al receptor (débito + crédito): la conservación es estructural.
///      Invariantes verificadas por fuzz (test/BarloventoTxInvariants.t.sol):
///        I1  Σ_a realBalanceOf(a) == totalSupplyX                      (no acuñación)
///        I2  real(a) >= depositTotal(a) + owed(a)                      (gate en mutaciones)
///        I3  depositTotal(a) == netOutflowGarantizado(a) × 3600        (fórmula §0)
///        I4  eur.balanceOf(this) == totalSupplyX                       (custodia 1:1 RE-01a)
///      Reglas canónicas: RepoTecnico/casos_uso.md §0 (sección 0, V3).
contract BarloventoTx is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ------------------------------------------------------------------ tipos
    enum Status {
        None,
        Active,
        Paused,
        Closed
    }

    struct Flow {
        int96 flowRate; // wei/s; >0 = sender paga a receiver
        Status status;
        uint40 lastUpdateTimestamp;
        uint128 accumulatedBalance; // BRLTx liquidados al receiver (invariable en Paused)
    }

    struct Aggregator {
        int96 netFlowRate; // solo activos: gobierna devengo presente
        int96 netOutflowGarantizado; // activos+pausados: gobierna depositTotal
        uint256 depositTotal; // garantizado × 3600 (sin techo, D10-bis)
        uint40 settledUpTo; // solo timestamp; inicial = primera mutación
        uint256 pendingDeficit; // wei impagados tras settle (RE-07b)
        uint128 pendingPool; // residuos de truncado no redistribuibles (< n wei)
    }

    // ------------------------------------------------------------------ estado
    IERC20 public immutable underlying;
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;

    mapping(address => uint256) public realBalanceOf;
    mapping(address => mapping(address => Flow)) internal _flows;
    /// PASIVO exigible del receiver, respaldado dentro de realBalanceOf[sender].
    mapping(address => mapping(address => uint256)) public earnedUnclaimed;
    mapping(address => Aggregator) internal _aggregators;

    // índice de parejas salientes; se poda cuando quedan inertes (Closed && owed==0)
    mapping(address => address[]) internal outflowList;
    mapping(address => uint256) internal outflowCount;
    mapping(address => mapping(address => uint256)) internal outflowSlotPlusOne;

    uint256 private _totalSupplyX;

    // ------------------------- eventos (RNF-10 lista cerrada doc técnico §2.3)
    event Wrapped(address indexed account, uint256 amount);
    event Unwrapped(address indexed account, uint256 amount);
    event FlowCreated(address indexed sender, address indexed receiver, int96 flowRate);
    event FlowPaused(address indexed sender, address indexed receiver);
    event FlowResumed(address indexed sender, address indexed receiver);
    event FlowClosed(address indexed sender, address indexed receiver, uint256 deltaLiquidated);
    event Settled(address indexed insolvent, uint256 settledUpTo, uint256 deficit);
    event Claimed(address indexed receiver, address indexed sender, uint256 amount);

    constructor(address underlyingToken, string memory tokenName, string memory tokenSymbol) {
        require(underlyingToken != address(0), "BarloventoTx: zero addr");
        underlying = IERC20(underlyingToken);
        name = tokenName;
        symbol = tokenSymbol;
    }

    // ------------------------------------------------------------- wrap/unwrap
    /// @dev CU-01: upgrade BRLT→BRLTx 1:1 (custodia total invariante, I4).
    function upgradeTo(uint256 amount) external nonReentrant {
        require(amount > 0, "BarloventoTx: zero amount");
        require(underlying.balanceOf(msg.sender) >= amount, "BRLT: insufficient balance");
        underlying.safeTransferFrom(msg.sender, address(this), amount);
        realBalanceOf[msg.sender] += amount;
        _totalSupplyX += amount;
        emit Wrapped(msg.sender, amount);
    }

    /// @dev CU-02: downgrade BRLTx→BRLT. free = real − depositTotal − owed (V3; incluye
    ///      parejas Closed con deuda: nunca se libera respaldo de pasivos vivos).
    function downgradeTo(uint256 amount) external nonReentrant {
        require(amount > 0, "BarloventoTx: zero amount");
        _materializeOutflows(msg.sender);
        Aggregator storage agg = _aggregators[msg.sender];
        uint256 real_ = realBalanceOf[msg.sender];
        uint256 locked = agg.depositTotal + _owedTotal(msg.sender);
        uint256 free = real_ > locked ? real_ - locked : 0;
        require(amount <= free, "BarloventoTx: locked by deposits");
        realBalanceOf[msg.sender] = real_ - amount;
        _totalSupplyX -= amount;
        underlying.safeTransfer(msg.sender, amount);
        emit Unwrapped(msg.sender, amount);
    }

    // ------------------------------------------------------------------ flows
    /// @dev CU-03: crea o reactiva (desde Closed) un flow saliente.
    ///      Gate canónico V3 (invariante 2): real ≥ deps_nuevo + owed_actual + rate×3600.
    function createFlow(address receiver, int96 rate) external nonReentrant {
        require(
            receiver != address(0) && receiver != address(this) && receiver != address(underlying),
            "BarloventoTx: invalid destination"
        );
        require(receiver != msg.sender, "BarloventoTx: self flow");
        require(rate > 0, "BarloventoTx: rate must be positive");
        Flow storage f = _flows[msg.sender][receiver];
        require(f.status != Status.Active && f.status != Status.Paused, "BarloventoTx: flow exists");

        _materializeOutflows(msg.sender);

        Aggregator storage aggS = _aggregators[msg.sender];
        uint256 newDeposit = uint256(int256(aggS.netOutflowGarantizado + rate)) * 3600;
        uint256 required = newDeposit + _owedTotal(msg.sender); // D54: apertura = 1 h (rate*3600)
        require(realBalanceOf[msg.sender] >= required, "BarloventoTx: insufficient free balance");

        if (f.status == Status.None) {
            f.accumulatedBalance = 0;
        }
        // Si era Closed con crédito, earnedUnclaimed/accumulated sobreviven como deuda viva.
        f.flowRate = rate;
        f.status = Status.Active;
        f.lastUpdateTimestamp = uint40(block.timestamp);

        aggS.netFlowRate -= rate;
        aggS.netOutflowGarantizado += rate;
        aggS.depositTotal = newDeposit;
        if (aggS.settledUpTo == 0) aggS.settledUpTo = uint40(block.timestamp);

        _aggregators[receiver].netFlowRate += rate;
        _indexOutflow(msg.sender, receiver);

        emit FlowCreated(msg.sender, receiver, rate);
    }

    /// @dev CU-05: pausa. RE-05a sin devengo; RE-05b retiene garantía.
    function pauseFlow(address receiver) external nonReentrant {
        Flow storage f = _flows[msg.sender][receiver];
        require(f.status == Status.Active, "BarloventoTx: already paused or missing");
        _materializePair(msg.sender, receiver, f);
        f.status = Status.Paused;
        _aggregators[msg.sender].netFlowRate += f.flowRate;
        emit FlowPaused(msg.sender, receiver);
    }

    /// @dev CU-05: reanuda desde ahora (el tramo pausado no se cobra, RE-05a).
    function resumeFlow(address receiver) external nonReentrant {
        Flow storage f = _flows[msg.sender][receiver];
        require(f.status == Status.Paused, "BarloventoTx: not paused");
        f.lastUpdateTimestamp = uint40(block.timestamp);
        f.status = Status.Active;
        _aggregators[msg.sender].netFlowRate -= f.flowRate;
        emit FlowResumed(msg.sender, receiver);
    }

    /// @dev CU-06: closeFlow ≡ deleteFlow (resolución H-03). Solo el sender.
    function closeFlow(address receiver) external nonReentrant {
        _closeFlow(msg.sender, receiver);
    }

    function deleteFlow(address receiver) external nonReentrant {
        _closeFlow(msg.sender, receiver);
    }

    function _closeFlow(address sender, address receiver) internal {
        Flow storage f = _flows[sender][receiver];
        uint8 st = uint8(f.status);
        require(st == 1 || st == 2, "BarloventoTx: only sender");
        uint256 before = f.accumulatedBalance;
        if (st == 1) _materializePair(sender, receiver, f);
        f.status = Status.Closed;

        Aggregator storage agg = _aggregators[sender];
        if (st == 1) agg.netFlowRate += f.flowRate;
        agg.netOutflowGarantizado -= f.flowRate;
        agg.depositTotal = uint256(int256(agg.netOutflowGarantizado)) * 3600;
        // El crédito earnedUnclaimed sobrevive como pasivo respaldado en real[sender].
        _pruneIfInert(sender, receiver);
        emit FlowClosed(sender, receiver, f.accumulatedBalance - before);
    }

    // -------------------------------------------------------------- insolvencia
    /// @dev CU-07 V3: insolvencia ⟺ owed > real tras materializar (condición de estado,
    ///      RE-07c; sin doble conteo: deps ⊆ real). PULL con haircut a la reserva propia;
    ///      déficit → pendingDeficit; residuo no acreditable queda registrado (el real del
    ///      emisor NO se destruye: conserva I1). Re-settle sin deuda = no-op idempotente.
    function settle(address insolventAccount) external nonReentrant {
        _materializeOutflows(insolventAccount);
        Aggregator storage agg = _aggregators[insolventAccount];

        // Snapshot de parejas con deuda (incluye Closed con crédito) + rates nominales.
        uint256 n = outflowCount[insolventAccount];
        address[] memory ds = new address[](n);
        uint256[] memory dues = new uint256[](n);
        uint256[] memory rates = new uint256[](n);
        uint256 totalDue = 0;
        uint256 totalRate = 0;
        uint256 m = 0;
        for (uint256 i = 0; i < n; ++i) {
            address r = outflowList[insolventAccount][i];
            uint256 e = earnedUnclaimed[r][insolventAccount];
            if (e > 0) {
                Flow storage fl = _flows[insolventAccount][r];
                ds[m] = r;
                dues[m] = e;
                rates[m] = uint256(int256(fl.flowRate)); // nominal §0: activos+pausados+closed con deuda
                totalDue += e;
                totalRate += uint256(int256(fl.flowRate));
                ++m;
            }
        }

        if (m == 0 && agg.netOutflowGarantizado == 0) {
            return; // no-op idempotente (CU-07 alternativos)
        }
        uint256 real_ = realBalanceOf[insolventAccount];
        require(totalDue > real_, "BarloventoTx: not insolvent");
        require(totalRate > 0, "BarloventoTx: nothing to settle");

        // Cerrar todos los salientes abiertos (el devengo vivo quedó materializado arriba).
        for (uint256 i = 0; i < n; ++i) {
            Flow storage fl = _flows[insolventAccount][outflowList[insolventAccount][i]];
            if (uint8(fl.status) == 1 || uint8(fl.status) == 2) fl.status = Status.Closed;
        }

        // Prorrateo por flowRate NOMINAL (única política §0): cuota recortada al debido;
        // residuo de truncado redistribuido wei-a-wei en orden de inserción (determinista)
        // a quienes aún tengan margen; si nadie puede recibirlo, permanece en el emisor.
        uint256 paid = real_;
        uint256 sumShares = 0;
        for (uint256 i = 0; i < m; ++i) {
            uint256 share = (paid * rates[i]) / totalRate;
            share = share > dues[i] ? dues[i] : share;
            earnedUnclaimed[ds[i]][insolventAccount] = share;
            sumShares += share;
        }
        uint256 residue = paid > sumShares ? paid - sumShares : 0;
        if (m > 0 && residue > 0) {
            for (uint256 i = 0; i < m && residue > 0; ++i) {
                uint256 credit = earnedUnclaimed[ds[i]][insolventAccount];
                uint256 room = dues[i] > credit ? dues[i] - credit : 0;
                uint256 add = room > residue ? residue : room;
                if (add > 0) {
                    earnedUnclaimed[ds[i]][insolventAccount] = credit + add;
                    sumShares += add;
                    residue -= add;
                }
            }
        }
        if (residue > 0 && residue <= type(uint128).max) {
            agg.pendingPool += uint128(residue); // registro informativo; el valor sigue en real
        }

        uint256 deficit = totalDue > paid ? totalDue - paid : 0;
        agg.netFlowRate = 0;
        agg.netOutflowGarantizado = 0;
        agg.depositTotal = 0;
        agg.pendingDeficit += deficit;
        agg.settledUpTo = uint40(block.timestamp);
        // real[insolvent] NO se toca: Σ shares ≤ paid = real respalda los créditos; los
        // claims lo descuentan de forma conservativa (I1).

        emit Settled(insolventAccount, block.timestamp, deficit);
    }

    /// @dev CU-07: reclamación pull — transfiere real del emisor al receptor.
    ///      Regla V3 (invariante I2): el claim no puede consumir la garantía (deps) de
    ///      los flujos aún vivos del emisor; si real − amount < deps, el receptor debe
    ///      instigar settle() (recorte equitativo sobre la reserva) o esperar liberación.
    function claimSettled(address from) external nonReentrant {
        uint256 amount = earnedUnclaimed[msg.sender][from];
        require(amount > 0, "BarloventoTx: nothing to claim");
        uint256 real_ = realBalanceOf[from];
        uint256 deps = _aggregators[from].depositTotal;
        require(real_ >= amount + deps, "BarloventoTx: reserve undercollateralized");
        earnedUnclaimed[msg.sender][from] = 0;
        realBalanceOf[from] = real_ - amount;
        realBalanceOf[msg.sender] += amount;
        _pruneIfInert(from, msg.sender);
        emit Claimed(msg.sender, from, amount);
    }

    // ------------------------------------------------------------------ vistas
    /// @dev CU-13/RF-07: proyección de lectura pura.
    function getFlow(address sender, address receiver)
        external
        view
        returns (int96 flowRate, Status status, uint256 accumulatedBalance, uint256 virtualDevengo)
    {
        Flow storage f = _flows[sender][receiver];
        uint256 acc = f.accumulatedBalance;
        if (f.status == Status.Active && block.timestamp > f.lastUpdateTimestamp) {
            acc += uint256(int256(f.flowRate)) * (block.timestamp - f.lastUpdateTimestamp);
        }
        return (f.flowRate, f.status, f.accumulatedBalance, acc);
    }

    function getAccountInfo(address account)
        external
        view
        returns (int96 netFlowRate, int96 netOutflowGarantizado, uint256 depositTotal, uint40 settledUpTo, uint256 pendingDeficit)
    {
        Aggregator storage a = _aggregators[account];
        return (a.netFlowRate, a.netOutflowGarantizado, a.depositTotal, a.settledUpTo, a.pendingDeficit);
    }

    /// @dev Saldo en tiempo presente: real − owed (materializado, incl. Closed) − tramo vivo.
    function virtualBalanceOf(address account) public view returns (int256) {
        int256 bal = int256(realBalanceOf[account]);
        for (uint256 i = 0; i < outflowCount[account]; ++i) {
            address r = outflowList[account][i];
            Flow storage f = _flows[account][r];
            uint8 st = uint8(f.status);
            if (st == 0) continue;
            bal -= int256(earnedUnclaimed[r][account]);
            if (st == 1 && block.timestamp > f.lastUpdateTimestamp) {
                bal -= int256(uint256(int256(f.flowRate)) * (block.timestamp - f.lastUpdateTimestamp));
            }
        }
        return bal;
    }

    function incomingUnclaimed(address receiver, address[] calldata senders)
        external
        view
        returns (uint256 total, uint256[] memory perSender)
    {
        perSender = new uint256[](senders.length);
        for (uint256 i = 0; i < senders.length; ++i) {
            Flow storage f = _flows[senders[i]][receiver];
            uint256 e = earnedUnclaimed[receiver][senders[i]];
            if (f.status == Status.Active && block.timestamp > f.lastUpdateTimestamp) {
                e += uint256(int256(f.flowRate)) * (block.timestamp - f.lastUpdateTimestamp);
            }
            perSender[i] = e;
            total += e;
        }
    }

    function totalSupplyX() external view returns (uint256) {
        return _totalSupplyX;
    }

    /// @dev Pasivo total exigible por receivers desde `account` (incluye Closed con deuda).
    function owedTotalOf(address account) external view returns (uint256) {
        return _owedTotal(account);
    }

    function getOpenOutflows(address sender) public view returns (address[] memory) {
        uint256 n = outflowCount[sender];
        address[] memory list = new address[](n);
        uint256 k = 0;
        for (uint256 i = 0; i < n; ++i) {
            address r = outflowList[sender][i];
            uint8 st = uint8(_flows[sender][r].status);
            if (st >= uint8(Status.Active) && st <= uint8(Status.Paused)) { // rango abierto
                list[k] = r;
                unchecked { ++k; }
            }
        }
        assembly {
            mstore(list, k)
        }
        return list;
    }

    // ------------------------------------------------------------------ interno
    function _indexOutflow(address sender, address receiver) internal {
        if (outflowSlotPlusOne[sender][receiver] == 0) {
            outflowList[sender].push(receiver);
            outflowCount[sender] = outflowList[sender].length;
            outflowSlotPlusOne[sender][receiver] = outflowList[sender].length;
        }
    }

    /// Poda swap-and-pop de parejas inertes (Closed y deuda cero): acota el O(n) de
    /// mutaciones y vistas (hallazgo MEDIA "índice sin poda").
    function _pruneIfInert(address sender, address receiver) internal {
        Flow storage f = _flows[sender][receiver];
        if (f.status != Status.Closed || earnedUnclaimed[receiver][sender] != 0) return;
        uint256 slotP1 = outflowSlotPlusOne[sender][receiver];
        if (slotP1 == 0) return;
        uint256 idx = slotP1 - 1;
        uint256 last = outflowCount[sender] - 1;
        if (idx != last) {
            address moved = outflowList[sender][last];
            outflowList[sender][idx] = moved;
            outflowSlotPlusOne[sender][moved] = idx + 1;
        }
        outflowList[sender].pop();
        outflowCount[sender] = outflowList[sender].length;
        delete outflowSlotPlusOne[sender][receiver];
    }

    function _owedTotal(address sender) internal view returns (uint256 owed) {
        for (uint256 i = 0; i < outflowCount[sender]; ++i) {
            owed += earnedUnclaimed[outflowList[sender][i]][sender];
        }
    }

    function _materializeOutflows(address sender) internal {
        for (uint256 i = 0; i < outflowCount[sender]; ++i) {
            address r = outflowList[sender][i];
            _materializePair(sender, r, _flows[sender][r]);
        }
        Aggregator storage agg = _aggregators[sender];
        if (agg.settledUpTo == 0) agg.settledUpTo = uint40(block.timestamp);
    }

    /// Acredita el tramo [lastUpdate..now] íntegro como pasivo exigible (real no cambia:
    /// el pasivo vive DENTRO de real[sender]; I1 se preserva por construcción).
    function _materializePair(address sender, address receiver, Flow storage f) internal {
        if (f.status != Status.Active) return;
        if (block.timestamp <= f.lastUpdateTimestamp) return;
        uint256 delta = uint256(int256(f.flowRate)) * (block.timestamp - f.lastUpdateTimestamp);
        f.accumulatedBalance += uint128(delta);
        earnedUnclaimed[receiver][sender] += delta;
        f.lastUpdateTimestamp = uint40(block.timestamp);
    }
}
