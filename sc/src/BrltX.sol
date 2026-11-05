// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title BrltX
 * @notice Super Token de nómina (Opción B, RF-02/RF-03). Envuelve BRLT 1:1 y
 *         mantiene flujos de pago continuos con semántica CFA simplificada.
 *
 * Modelo de saldos
 * ----------------
 *  - `upgrade`   : BRLT del usuario -> contrato; se acuña BrltX al usuario (1:1).
 *  - `downgrade` : se quema BrltX del usuario; se devuelve BRLT (cobro, RF-21).
 *  - flujo       : el admin deposita BRLT en escrow; el devengo se acuña como
 *                  BrltX al receptor de forma perezosa (`settleFlow`, `deleteFlow`).
 *
 * Invariante de respaldo:
 *     brlt.balanceOf(this) == totalSupply() + totalEscrow
 * donde `totalEscrow` es el BRLT depositado aún no devengado ni devuelto.
 *
 * Fin de flujo (AC-02): la EVM no se auto-ejecuta. Al alcanzar `endsAt` el flujo
 * queda «vencido pendiente de liquidación» y *cualquier* cuenta puede llamar
 * `settleFlow`, que acredita lo devengado al receptor y devuelve el remanente al
 * admin. No existe transición automática a terminado.
 *
 * Robustez (AC-07): `ReentrancyGuard` + CEI en todas las mutaciones, `Pausable`
 * de emergencia que solo bloquea crear/actualizar/cambiar receptor (nunca
 * `settleFlow`, `deleteFlow` ni `downgrade`) y shortfall explícito.
 */
contract BrltX is ERC20, Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Estado de un flujo individual. Cada par (sender, receiver) puede
    ///         tener varios flujos simultáneos (AC-23), identificados por `flowId`.
    struct Flow {
        uint128 flowRate; // wei de BRLT por segundo (0 mientras está pausado)
        uint64 startedAt; // inicio efectivo del tramo de devengo actual
        uint64 endsAt; // fin del flujo; al alcanzarlo queda vencido
        uint64 lastSettledAt; // último instante en que se liquidó
        uint64 pausedAt; // 0 si no está pausado
        uint256 rateBeforePause; // tasa vigente al pausar (se restaura al reanudar)
        uint256 deposited; // BRLT en escrow para este flujo
        uint256 settled; // importe ya acreditado al receptor
        address sender; // admin que financia el flujo
        address receiver; // empleado que devenga
        bool paused;
        bool terminated;
    }

    /// @notice BRLT envuelto.
    IERC20 public immutable brlt;

    /// @notice Último `flowId` asignado (los ids empiezan en 1).
    uint256 public lastFlowId;

    /// @notice BRLT depositado en escrow y aún no devengado ni devuelto.
    uint256 public totalEscrow;

    /// @notice Duraciones permitidas para crear flujos (6/15/30/90 días por defecto).
    mapping(uint64 duration => bool allowed) public allowedDurations;

    mapping(uint256 flowId => Flow) private _flows;
    mapping(address receiver => uint256[] flowIds) private _flowsByReceiver;
    mapping(address sender => uint256[] flowIds) private _flowsBySender;
    mapping(address sender => mapping(address receiver => uint256[] flowIds)) private _flowsByPair;

    event FlowCreated(
        uint256 indexed flowId,
        address indexed sender,
        address indexed receiver,
        uint256 amount,
        uint256 flowRate,
        uint64 endsAt
    );
    event FlowUpdated(
        uint256 indexed flowId,
        address indexed sender,
        address indexed receiver,
        uint256 oldFlowRate,
        uint256 newFlowRate
    );
    event FlowSettled(
        uint256 indexed flowId, address indexed sender, address indexed receiver, uint256 amount, uint256 cumulative
    );
    event FlowDeleted(
        uint256 indexed flowId, address indexed sender, address indexed receiver, uint256 paid, uint256 returnedAmount
    );
    event FlowExpired(
        uint256 indexed flowId, address indexed sender, address indexed receiver, uint256 paid, uint256 returnedAmount
    );
    event Upgraded(address indexed account, uint256 amount);
    event Downgraded(address indexed account, uint256 amount);
    event DurationAllowed(uint64 duration, bool allowed);

    error ZeroAddress();
    error ZeroAmount();
    error SelfFlow();
    error InvalidDuration(uint64 duration);
    error ZeroFlowRate();
    error RateOverflow(uint256 rate);
    error RateTooHigh(uint256 rate, uint256 available);
    error UnknownFlow(uint256 flowId);
    error NotFlowSender(uint256 flowId, address caller);
    error FlowTerminated(uint256 flowId);
    error FlowExpiredAlready(uint256 flowId);
    error FlowPaused(uint256 flowId);
    error FlowAlreadyPaused(uint256 flowId);
    error FlowNotExpired(uint256 flowId, uint64 endsAt);
    error NoFlowForPair(address sender, address receiver);
    error SameReceiver();
    error Shortfall(uint256 required, uint256 available);
    error ProtectedToken();

    constructor(address brlt_, address initialOwner) ERC20("BrltX", "BrltX") Ownable(initialOwner) {
        if (brlt_ == address(0)) revert ZeroAddress();
        brlt = IERC20(brlt_);
        _setDurationAllowed(6 days, true);
        _setDurationAllowed(15 days, true);
        _setDurationAllowed(30 days, true);
        _setDurationAllowed(90 days, true);
    }

    // ---------------------------------------------------------------------
    // Envoltura 1:1
    // ---------------------------------------------------------------------

    /// @notice Convierte `amount` BRLT del llamante en `amount` BrltX.
    function upgrade(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        brlt.safeTransferFrom(msg.sender, address(this), amount);
        _mint(msg.sender, amount);
        emit Upgraded(msg.sender, amount);
    }

    /// @notice Cobro: quema `amount` BrltX del llamante y entrega BRLT en la misma tx.
    /// @dev Disponible siempre, incluso con el contrato pausado (AC-07).
    function downgrade(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        _burn(msg.sender, amount);
        brlt.safeTransfer(msg.sender, amount);
        emit Downgraded(msg.sender, amount);
    }

    // ---------------------------------------------------------------------
    // Ciclo de flujos
    // ---------------------------------------------------------------------

    /**
     * @notice Crea un flujo tomando `amount` BRLT del llamante y registrando la tasa.
     * @dev `flowRate = amount / durationSeconds` (floor al wei). El residuo queda en
     *      escrow y se devuelve al admin al liquidar o terminar.
     * @return flowId Identificador global del flujo creado.
     */
    function wrapAndCreateFlow(uint256 amount, address receiver, uint64 durationSeconds)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 flowId)
    {
        flowId = _wrapAndCreateFlow(msg.sender, amount, receiver, durationSeconds, true);
    }

    /// @notice Pausa (`newFlowRate = 0`), reanuda o cambia la tasa de un flujo.
    function updateFlow(uint256 flowId, uint128 newFlowRate) external nonReentrant whenNotPaused {
        Flow storage f = _flows[flowId];
        if (f.sender == address(0)) revert UnknownFlow(flowId);
        if (msg.sender != f.sender) revert NotFlowSender(flowId, msg.sender);
        _updateFlow(flowId, newFlowRate);
    }

    /// @notice Sobrecarga por compatibilidad: opera sobre el flujo más reciente del par.
    function updateFlow(address receiver, uint128 newFlowRate) external nonReentrant whenNotPaused {
        uint256 flowId = _latestFlowId(msg.sender, receiver);
        _updateFlow(flowId, newFlowRate);
    }

    /**
     * @notice Termina un flujo del llamante: liquida lo devengado y devuelve el
     *         remanente de BRLT al admin en la misma transacción (RF-03).
     */
    function deleteFlow(uint256 flowId) external nonReentrant returns (uint256 paid, uint256 returnedAmount) {
        Flow storage f = _flows[flowId];
        if (f.sender == address(0)) revert UnknownFlow(flowId);
        if (msg.sender != f.sender) revert NotFlowSender(flowId, msg.sender);
        if (f.terminated) revert FlowTerminated(flowId);
        return _finish(flowId, block.timestamp, false);
    }

    /// @notice Sobrecarga: termina el flujo más reciente hacia `receiver`.
    function deleteFlow(address receiver) external nonReentrant returns (uint256 paid, uint256 returnedAmount) {
        uint256 flowId = _latestFlowId(msg.sender, receiver);
        Flow storage f = _flows[flowId];
        if (f.terminated) revert FlowTerminated(flowId);
        return _finish(flowId, block.timestamp, false);
    }

    /**
     * @notice Liquida un flujo vencido. Público y sin permiso (AC-02): puede llamarlo
     *         el admin, el empleado o un tercero.
     */
    function settleFlow(uint256 flowId) public nonReentrant returns (uint256 paid, uint256 returnedAmount) {
        Flow storage f = _flows[flowId];
        if (f.sender == address(0)) revert UnknownFlow(flowId);
        if (f.terminated) revert FlowTerminated(flowId);
        if (f.paused) revert FlowPaused(flowId);
        if (block.timestamp < f.endsAt) revert FlowNotExpired(flowId, f.endsAt);
        return _finish(flowId, f.endsAt, true);
    }

    /// @notice Sobrecarga: liquida el flujo más reciente del par (debe estar vencido).
    function settleFlow(address sender, address receiver) external returns (uint256 paid, uint256 returnedAmount) {
        return settleFlow(_latestFlowId(sender, receiver));
    }

    /**
     * @notice Cambia el receptor de un flujo de forma atómica (AC-03).
     * @dev Liquida al receptor antiguo, cierra el flujo y reabre uno nuevo hacia la
     *      wallet nueva con el remanente y el tiempo restante. Si algo revierte, no
     *      hay cambio parcial.
     */
    function changeReceiver(uint256 flowId, address newReceiver)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 newFlowId)
    {
        Flow storage f = _flows[flowId];
        if (f.sender == address(0)) revert UnknownFlow(flowId);
        if (msg.sender != f.sender) revert NotFlowSender(flowId, msg.sender);
        if (f.terminated) revert FlowTerminated(flowId);
        if (newReceiver == address(0)) revert ZeroAddress();
        if (newReceiver == f.receiver) revert SameReceiver();
        if (newReceiver == f.sender) revert SelfFlow();

        uint256 paid = _settleAt(flowId, block.timestamp);
        uint256 remaining = f.deposited - f.settled;
        if (remaining == 0) revert ZeroAmount();
        uint128 rate = f.paused ? uint128(f.rateBeforePause) : f.flowRate;
        if (rate == 0) revert ZeroFlowRate();

        uint64 horizon = f.paused ? f.pausedAt : uint64(block.timestamp);
        if (f.endsAt <= horizon) revert FlowExpiredAlready(flowId);
        uint64 remainingTime = f.endsAt - horizon;
        bool wasPaused = f.paused;

        address sender = f.sender;
        address oldReceiver = f.receiver;

        // Se cierra el flujo antiguo sin devolver BRLT: el escrow pasa al nuevo.
        f.terminated = true;
        f.flowRate = 0;
        f.paused = false;
        f.pausedAt = 0;
        f.rateBeforePause = 0;
        emit FlowDeleted(flowId, sender, oldReceiver, paid, 0);

        newFlowId = _pushFlow(sender, newReceiver, remaining, rate, remainingTime, wasPaused);
    }

    /**
     * @notice Sobrecarga documentada en el documento técnico: cierra el flujo más
     *         reciente hacia `oldReceiver` (devolviendo su remanente al admin) y crea
     *         un flujo nuevo de `amount` BRLT por `durationSeconds` hacia `newReceiver`.
     */
    function changeReceiver(address oldReceiver, address newReceiver, uint256 amount, uint64 durationSeconds)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 newFlowId)
    {
        if (newReceiver == address(0)) revert ZeroAddress();
        if (newReceiver == oldReceiver) revert SameReceiver();
        if (newReceiver == msg.sender) revert SelfFlow();

        uint256 flowId = _latestFlowId(msg.sender, oldReceiver);
        Flow storage old = _flows[flowId];
        if (old.terminated) revert FlowTerminated(flowId);
        _finish(flowId, block.timestamp, false);

        newFlowId = _wrapAndCreateFlow(msg.sender, amount, newReceiver, durationSeconds, true);
    }

    // ---------------------------------------------------------------------
    // Administración
    // ---------------------------------------------------------------------

    /// @notice Pausa de emergencia: bloquea crear/actualizar/cambiar receptor.
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Habilita o deshabilita una duración de flujo.
    function setDurationAllowed(uint64 duration, bool allowed) external onlyOwner {
        _setDurationAllowed(duration, allowed);
    }

    /// @notice Recupera tokens ajenos enviados por error. Nunca BRLT ni BrltX.
    function recoverForeignToken(IERC20 token, address to, uint256 amount) external onlyOwner nonReentrant {
        if (address(token) == address(brlt) || address(token) == address(this)) revert ProtectedToken();
        if (to == address(0)) revert ZeroAddress();
        token.safeTransfer(to, amount);
    }

    // ---------------------------------------------------------------------
    // Consultas
    // ---------------------------------------------------------------------

    function getFlow(uint256 flowId) external view returns (Flow memory) {
        return _flows[flowId];
    }

    /// @notice Flujo más reciente del par (incluye terminados). Un par puede tener varios.
    function getFlow(address sender, address receiver) external view returns (Flow memory) {
        uint256[] storage ids = _flowsByPair[sender][receiver];
        if (ids.length == 0) return _flows[0];
        return _flows[ids[ids.length - 1]];
    }

    function getFlowIdsByReceiver(address receiver) external view returns (uint256[] memory) {
        return _flowsByReceiver[receiver];
    }

    function getFlowIdsBySender(address sender) external view returns (uint256[] memory) {
        return _flowsBySender[sender];
    }

    function getFlowIdsByPair(address sender, address receiver) external view returns (uint256[] memory) {
        return _flowsByPair[sender][receiver];
    }

    /// @notice Importe devengado y aún no acreditado de un flujo.
    function getPending(uint256 flowId) external view returns (uint256) {
        Flow storage f = _flows[flowId];
        if (f.sender == address(0) || f.terminated) return 0;
        return _accruedAt(f, block.timestamp) - f.settled;
    }

    /// @notice Saldo cobrable: BrltX en cartera + devengo pendiente de sus flujos.
    function getRealtimeBalance(address account) external view returns (uint256 total) {
        total = balanceOf(account);
        uint256[] storage ids = _flowsByReceiver[account];
        uint256 length = ids.length;
        for (uint256 i = 0; i < length; ++i) {
            Flow storage f = _flows[ids[i]];
            if (f.terminated) continue;
            total += _accruedAt(f, block.timestamp) - f.settled;
        }
    }

    /// @notice BRLT retenido por el contrato (respaldo total).
    function brltBacking() external view returns (uint256) {
        return brlt.balanceOf(address(this));
    }

    // ---------------------------------------------------------------------
    // Internos
    // ---------------------------------------------------------------------

    function _setDurationAllowed(uint64 duration, bool allowed) internal {
        allowedDurations[duration] = allowed;
        emit DurationAllowed(duration, allowed);
    }

    function _wrapAndCreateFlow(address sender, uint256 amount, address receiver, uint64 durationSeconds, bool enforce)
        internal
        returns (uint256 flowId)
    {
        if (amount == 0) revert ZeroAmount();
        if (receiver == address(0)) revert ZeroAddress();
        if (receiver == sender) revert SelfFlow();
        if (durationSeconds == 0) revert InvalidDuration(durationSeconds);
        if (enforce && !allowedDurations[durationSeconds]) revert InvalidDuration(durationSeconds);

        uint256 rate = amount / durationSeconds;
        if (rate == 0) revert ZeroFlowRate();
        if (rate > type(uint128).max) revert RateOverflow(rate);

        brlt.safeTransferFrom(sender, address(this), amount);
        totalEscrow += amount;

        flowId = _pushFlow(sender, receiver, amount, uint128(rate), durationSeconds, false);
    }

    /// @dev Registra un flujo ya financiado (el escrow ya está contabilizado).
    function _pushFlow(
        address sender,
        address receiver,
        uint256 amount,
        uint128 rate,
        uint64 durationSeconds,
        bool pausedNow
    ) internal returns (uint256 flowId) {
        flowId = ++lastFlowId;
        Flow storage f = _flows[flowId];
        f.sender = sender;
        f.receiver = receiver;
        f.startedAt = uint64(block.timestamp);
        f.endsAt = uint64(block.timestamp) + durationSeconds;
        f.lastSettledAt = uint64(block.timestamp);
        f.deposited = amount;

        uint256 effectiveRate = rate;
        if (pausedNow) {
            f.flowRate = 0;
            f.rateBeforePause = rate;
            f.paused = true;
            f.pausedAt = uint64(block.timestamp);
            effectiveRate = 0;
        } else {
            f.flowRate = rate;
        }

        _flowsBySender[sender].push(flowId);
        _flowsByReceiver[receiver].push(flowId);
        _flowsByPair[sender][receiver].push(flowId);

        emit FlowCreated(flowId, sender, receiver, amount, effectiveRate, f.endsAt);
    }

    /// @dev Devengo acumulado del flujo en `timestamp`, acotado por `deposited`.
    ///      `startedAt` se reancla tras cada pausa o cambio de tasa, por lo que el
    ///      total devengado es `settled` (histórico) + la tasa por el tramo vigente.
    function _accruedAt(Flow storage f, uint256 timestamp) internal view returns (uint256) {
        if (f.terminated) return f.settled;
        uint64 horizon = f.paused ? f.pausedAt : uint64(timestamp);
        if (horizon > f.endsAt) horizon = f.endsAt;
        if (horizon <= f.startedAt) return f.settled;

        uint256 owed = f.settled + uint256(f.flowRate) * (horizon - f.startedAt);
        if (owed > f.deposited) owed = f.deposited;
        if (owed < f.settled) owed = f.settled;
        return owed;
    }

    /// @dev Acredita al receptor la diferencia entre lo devengado y lo ya liquidado.
    function _settleAt(uint256 flowId, uint256 timestamp) internal returns (uint256 paid) {
        Flow storage f = _flows[flowId];
        uint256 owed = _accruedAt(f, timestamp);
        if (owed > f.deposited) revert Shortfall(owed, f.deposited);
        paid = owed - f.settled;
        if (paid == 0) return 0;

        f.settled = owed;
        f.lastSettledAt = uint64(timestamp);
        totalEscrow -= paid;
        _mint(f.receiver, paid);
        emit FlowSettled(flowId, f.sender, f.receiver, paid, owed);
    }

    /// @dev Liquida, marca terminado y devuelve el remanente al admin.
    function _finish(uint256 flowId, uint256 timestamp, bool expired)
        internal
        returns (uint256 paid, uint256 returnedAmount)
    {
        Flow storage f = _flows[flowId];
        paid = _settleAt(flowId, timestamp);
        returnedAmount = f.deposited - f.settled;

        f.terminated = true;
        f.paused = false;
        f.pausedAt = 0;
        f.rateBeforePause = 0;
        f.flowRate = 0;

        if (returnedAmount > 0) {
            totalEscrow -= returnedAmount;
            brlt.safeTransfer(f.sender, returnedAmount);
        }

        if (expired) {
            emit FlowExpired(flowId, f.sender, f.receiver, paid, returnedAmount);
        } else {
            emit FlowDeleted(flowId, f.sender, f.receiver, paid, returnedAmount);
        }
    }

    function _latestFlowId(address sender, address receiver) internal view returns (uint256 flowId) {
        uint256[] storage ids = _flowsByPair[sender][receiver];
        if (ids.length == 0) revert NoFlowForPair(sender, receiver);
        return ids[ids.length - 1];
    }

    function _updateFlow(uint256 flowId, uint128 newFlowRate) internal {
        Flow storage f = _flows[flowId];
        if (f.terminated) revert FlowTerminated(flowId);
        if (f.paused && newFlowRate == 0) revert FlowAlreadyPaused(flowId);
        if (!f.paused && block.timestamp >= f.endsAt) revert FlowExpiredAlready(flowId);

        uint256 oldRate = f.flowRate == 0 ? f.rateBeforePause : f.flowRate;

        if (newFlowRate == 0) {
            // Pausa: se liquida hasta el instante actual y se congela el devengo.
            _settleAt(flowId, block.timestamp);
            f.rateBeforePause = oldRate;
            f.flowRate = 0;
            f.paused = true;
            f.pausedAt = uint64(block.timestamp);
        } else {
            // Reanudación o cambio de tasa: se liquida lo devengado y se reancla el
            // tramo en `now`, recalculando `endsAt` para repartir el remanente. Con
            // la misma tasa el nuevo `endsAt` coincide con el original más el tiempo
            // pausado (la pausa no resta devengo al empleado).
            _settleAt(flowId, block.timestamp);
            uint256 remaining = f.deposited - f.settled;
            if (remaining < newFlowRate) revert RateTooHigh(newFlowRate, remaining);
            f.paused = false;
            f.pausedAt = 0;
            f.rateBeforePause = 0;
            f.flowRate = newFlowRate;
            f.startedAt = uint64(block.timestamp);
            f.endsAt = uint64(block.timestamp) + uint64(remaining / newFlowRate);
        }
        emit FlowUpdated(flowId, f.sender, f.receiver, oldRate, newFlowRate);
    }
}
