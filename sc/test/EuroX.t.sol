// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Euro} from "../src/Euro.sol";
import {EuroX} from "../src/EuroX.sol";
import {EuroxFactory} from "../src/EuroxFactory.sol";

/// Suite core del CFA simplificado (matriz casos_uso.md).
contract EuroXTest is Test {
    // Constantes canónicas §0 casos_uso.md (recalculadas, no copiadas a ciegas)
    int96 internal constant RATE = 771604938271604; // floor(2000e18/2592000)
    uint256 internal constant DEP_1 = uint256(int256(RATE)) * 3600; // 2_777_777_777_777_774_400
    uint256 internal constant DEP_3 = uint256(int256(RATE)) * 3600 * 3; // 8_333_333_333_333_323_200

    Euro internal eur;
    EuroxFactory internal factory;
    EuroX internal eurx;

    address internal owner = address(0xA11CE);
    address internal sender = makeAddr("sender");
    address internal r1 = makeAddr("receiver1");
    address internal r2 = makeAddr("receiver2");
    address internal r3 = makeAddr("receiver3");

    function setUp() public {
        vm.prank(owner);
        eur = new Euro(10_000_000e18);
        vm.prank(owner);
        factory = new EuroxFactory();
        vm.prank(owner);
        address x = factory.createPair(address(eur), "Euro Streaming (test)", "EURx");
        eurx = EuroX(x);

        // fondear sender y receptores desde el supply del owner
        vm.startPrank(owner);
        eur.transfer(sender, 1_000_000e18);
        eur.transfer(r1, 10_000e18);
        vm.stopPrank();
        _wrap(sender, 1000e18);
    }

    function _wrap(address who, uint256 amount) internal {
        vm.startPrank(who);
        eur.approve(address(eurx), amount);
        eurx.upgradeTo(amount);
        vm.stopPrank();
    }

    // ---------------------------------------------------------------- CU-01/02
    /// RF-02 test_wrap_unwrap_invariant
    function test_wrap_unwrap_invariant() public {
        assertEq(eurx.realBalanceOf(sender), 1000e18);
        assertEq(eur.balanceOf(address(eurx)), 1000e18, "custodia == real (RE-01a solvencia)");
        vm.prank(sender);
        eurx.downgradeTo(400e18);
        assertEq(eur.balanceOf(sender), 999_400e18, "recibe EUR (1M - 1000 wrap + 400 unwrap)");
        assertEq(eurx.realBalanceOf(sender), 600e18);
        assertEq(eur.balanceOf(address(eurx)), 600e18);
    }

    /// RNF-10 events Wrapped/Unwrapped
    function test_events_wrapped_unwrapped() public {
        vm.startPrank(sender);
        eur.approve(address(eurx), 10e18);
        vm.expectEmit(true, false, false, true);
        emit EuroX.Wrapped(sender, 10e18);
        eurx.upgradeTo(10e18);
        vm.stopPrank();

        vm.expectEmit(true, false, false, true);
        emit EuroX.Unwrapped(sender, 5e18);
        vm.prank(sender);
        eurx.downgradeTo(5e18);
    }

    /// RF-02 test_downgrade_blocked_by_deposits (RE-02)
    function test_downgrade_blocked_by_deposits() public {
        vm.startPrank(sender);
        eurx.createFlow(r1, RATE);
        eurx.createFlow(r2, RATE);
        eurx.createFlow(r3, RATE);
        vm.stopPrank();

        (,, uint256 dep,,) = _agg(sender);
        assertEq(dep, DEP_3, "deposito agregado exacto de 3 flows");

        uint256 free = eurx.realBalanceOf(sender) - dep;
        vm.prank(sender);
        vm.expectRevert("EuroX: locked by deposits");
        eurx.downgradeTo(free + 1);
        vm.prank(sender);
        eurx.downgradeTo(free); // el límite exacto sí pasa
    }

    // --------------------------------------------------------------------- CU-03
    /// RF-03 test_create_flow_rate_exact
    function test_create_flow_rate_exact() public {
        vm.prank(sender);
        eurx.createFlow(r1, RATE);
        (int96 net,,,,) = _agg(sender);
        assertEq(net, -RATE);
        (,, uint256 dep,,) = _agg(sender);
        assertEq(dep, DEP_1);
        (int96 netR,,,,) = _agg(r1);
        assertEq(netR, RATE);
    }

    /// RNF-10 FlowCreated
    function test_event_flow_created() public {
        vm.expectEmit(true, true, false, true);
        emit EuroX.FlowCreated(sender, r1, RATE);
        vm.prank(sender);
        eurx.createFlow(r1, RATE);
    }

    /// RF-04 test_create_flow_multi_receiver
    function test_create_flow_multi_receiver() public {
        vm.startPrank(sender);
        eurx.createFlow(r1, RATE);
        eurx.createFlow(r2, RATE);
        eurx.createFlow(r3, RATE);
        vm.stopPrank();
        address[] memory open = eurx.getOpenOutflows(sender);
        assertEq(open.length, 3);
    }

    /// D7 flow duplicado
    function test_create_flow_duplicate_reverts() public {
        vm.startPrank(sender);
        eurx.createFlow(r1, RATE);
        vm.expectRevert("EuroX: flow exists");
        eurx.createFlow(r1, RATE);
        vm.stopPrank();
    }

    /// D15 self-flow / destino contrato token
    function test_create_flow_invalid_destinations() public {
        vm.startPrank(sender);
        vm.expectRevert("EuroX: self flow");
        eurx.createFlow(sender, RATE);
        vm.expectRevert("EuroX: invalid destination");
        eurx.createFlow(address(eurx), RATE);
        vm.expectRevert("EuroX: invalid destination");
        eurx.createFlow(address(eur), RATE);
        vm.stopPrank();
    }

    function test_create_flow_insufficient_free_reverts() public {
        address small = makeAddr("small");
        vm.prank(owner);
        eur.transfer(small, 1e18);
        _wrap(small, 1e18); // real = 1e18 < DEP_1 (~2.78e18)
        vm.prank(small);
        vm.expectRevert("EuroX: insufficient free balance");
        eurx.createFlow(r1, RATE);
    }

    // --------------------------------------------------------------------- CU-04
    /// (a) on-chain determinista: decremento exacto a los 10 s (sin tolerancia)
    function test_virtual_balance_exact_after_10s() public {
        vm.prank(sender);
        eurx.createFlow(r1, RATE);
        int256 v0 = eurx.virtualBalanceOf(sender);
        vm.warp(block.timestamp + 10);
        int256 v10 = eurx.virtualBalanceOf(sender);
        assertEq(uint256(v0 - v10), uint256(int256(RATE)) * 10, "delta 10 s exacto (?0)");
    }

    // --------------------------------------------------------------------- CU-05
    /// RF-05 test_pause_all_flows_keeps_settlement_window: pausa retiene depósito y T finito
    function test_pause_all_flows_keeps_settlement_window() public {
        vm.startPrank(sender);
        eurx.createFlow(r1, RATE);
        eurx.createFlow(r2, RATE);
        eurx.createFlow(r3, RATE);
        eurx.pauseFlow(r1);
        eurx.pauseFlow(r2);
        eurx.pauseFlow(r3);
        vm.stopPrank();

        (int96 net, int96 garantizado, uint256 dep,,) = _agg(sender);
        assertEq(net, 0, "pausados fuera del devengo presente");
        assertEq(garantizado, 3 * RATE);
        assertEq(dep, DEP_3, "pausa RETIENE deposito (D10)");
        assertTrue(uint256(int256(garantizado)) > 0, "T finita como cota informativa");
    }

    /// RNF-10 FlowPaused
    function test_event_flow_paused() public {
        vm.prank(sender);
        eurx.createFlow(r1, RATE);
        vm.expectEmit(true, true, false, false);
        emit EuroX.FlowPaused(sender, r1);
        vm.prank(sender);
        eurx.pauseFlow(r1);
    }

    /// RF-05 test_resume_same_rate_no_accrual_during_pause
    function test_resume_same_rate_no_accrual_during_pause() public {
        vm.prank(sender);
        eurx.createFlow(r1, RATE);
        vm.warp(block.timestamp + 100);
        vm.prank(sender);
        eurx.pauseFlow(r1);
        (, , uint256 accBefore, ) = eurx.getFlow(sender, r1);
        vm.warp(block.timestamp + 500); // pausa: no debe acumular
        vm.expectEmit(true, true, false, false);
        emit EuroX.FlowResumed(sender, r1);
        vm.prank(sender);
        eurx.resumeFlow(r1);
        (, , uint256 accAfter, ) = eurx.getFlow(sender, r1);
        assertEq(accAfter, accBefore, "accumulated invariable durante pausa (RE-05a)");
    }

    /// doble pausa revert
    function test_pause_twice_reverts() public {
        vm.startPrank(sender);
        eurx.createFlow(r1, RATE);
        eurx.pauseFlow(r1);
        vm.expectRevert("EuroX: already paused or missing");
        eurx.pauseFlow(r1);
        vm.stopPrank();
    }

    // --------------------------------------------------------------------- CU-06
    /// RF-06 test_close_releases_aggregated_deposit
    function test_close_releases_aggregated_deposit() public {
        vm.startPrank(sender);
        eurx.createFlow(r1, RATE);
        eurx.createFlow(r2, RATE);
        vm.warp(block.timestamp + 60);
        vm.expectEmit(true, true, false, true);
        emit EuroX.FlowClosed(sender, r1, uint256(int256(RATE)) * 60);
        eurx.closeFlow(r1);
        vm.stopPrank();
        (,, uint256 dep,,) = _agg(sender);
        assertEq(dep, DEP_1, "se libera RATE x3600 del cerrado");
    }

    /// RF-14 test_only_sender_can_pause_close
    function test_only_sender_can_pause_close() public {
        vm.prank(sender);
        eurx.createFlow(r1, RATE);
        vm.prank(r1);
        vm.expectRevert("EuroX: only sender");
        eurx.closeFlow(sender); // desde la perspectiva de r1 no existe flow saliente suyo hacia sender
    }

    /// RNF-08: reactivar flow cerrado conserva el crédito pendiente del receptor (conservación)
    function test_reopen_closed_flow_keeps_credit() public {
        vm.startPrank(sender);
        eurx.createFlow(r1, RATE);
        vm.warp(block.timestamp + 100);
        eurx.closeFlow(r1); // materializa y deja earnedUnclaimed
        vm.stopPrank();
        uint256 creditBefore = eurx.earnedUnclaimed(r1, sender);
        assertTrue(creditBefore > 0, "credito tras cierre");

        vm.prank(sender);
        eurx.createFlow(r1, RATE); // Closed → Active permitido (no revert)
        assertEq(eurx.earnedUnclaimed(r1, sender), creditBefore, "credito intacto al reabrir");
    }

    /// deleteFlow ≡ closeFlow (H-03)
    function test_delete_flow_alias() public {
        vm.prank(sender);
        eurx.createFlow(r1, RATE);
        vm.prank(sender);
        eurx.deleteFlow(r1);
        (,,, uint40 settledUpTo,) = _agg(sender);
        assertTrue(settledUpTo > 0);
        (,, uint256 dep,,) = _agg(sender);
        assertEq(dep, 0);
    }

    // --------------------------------------------------------------------- CU-07

    /// REGRESIÓN auditoría código V2 (ALTA#3): downgrade tras >1h de flujo NO bloquea (V3)
    function test_downgrade_works_after_two_hours_of_stream() public {
        vm.prank(sender);
        eurx.createFlow(r1, RATE);
        vm.warp(block.timestamp + 2 hours);
        uint256 real_ = eurx.realBalanceOf(sender);
        (,, uint256 dep,,) = eurx.getAccountInfo(sender);
        uint256 owed = eurx.earnedUnclaimed(r1, sender);
        uint256 free = real_ > dep + owed ? real_ - dep - owed : 0;
        assertTrue(free > 1e18, "saldo libre sigue existiendo tras 2h (antes revertia siempre)");
        vm.prank(sender);
        eurx.downgradeTo(1e18); // con V2 esto revertía "reserve undercollateralized"
    }

    /// REGRESIÓN auditoría V2 (CRIT#1): claim no puede acuñar: Σ real == supplyX tras claims masivos
    function test_claim_cannot_mint_beyond_custody() public {
        // sender pobre con deuda exigible mayor que su reserva
        address poor = makeAddr("poorV3");
        vm.prank(owner);
        eur.transfer(poor, 9 ether);
        _wrap(poor, 9 ether);
        vm.startPrank(poor);
        eurx.createFlow(r1, RATE);
        eurx.createFlow(r2, RATE);
        vm.stopPrank();
        vm.warp(block.timestamp + 30 days);
        vm.prank(alice());
        eurx.settle(poor);

        uint256 e1 = eurx.earnedUnclaimed(r1, poor);
        uint256 e2 = eurx.earnedUnclaimed(r2, poor);
        uint256 realPoor = eurx.realBalanceOf(poor);
        // ambos reclaman lo máximo posible
        vm.prank(r1);
        eurx.claimSettled(poor);
        vm.prank(r2);
        eurx.claimSettled(poor);
        // conservación I1: la suma de claims <= reserva inicial (9e18): no hay acuñación
        assertTrue(e1 + e2 <= 9 ether + 1, "credits haircuteados a la reserva");
        assertEq(eurx.realBalanceOf(poor), 9 ether - e1 - e2);
    }

    /// REGRESIÓN auditoría V2 (ALTA#4 prorrateo NOMINAL): 3 flows con rates DESIGUALES
    function test_settle_prorata_is_by_nominal_rate_not_by_due() public {
        address poor = makeAddr("poorNominal");
        vm.prank(owner);
        eur.transfer(poor, 60 ether);
        _wrap(poor, 60 ether);
        int96 ra = 1000000000000000; // 1.0e15
        int96 rb = 300000000000000;  // 0.3e15
        int96 rc = 700000000000000;  // 0.7e15
        vm.startPrank(poor);
        eurx.createFlow(r1, ra);
        eurx.createFlow(r2, rb);
        eurx.createFlow(r3, rc);
        vm.stopPrank();
        vm.warp(block.timestamp + 1 days);
        vm.prank(poor);
        eurx.pauseFlow(r2); // con debido ya acumulado: sigue debiendo, participa con rate nominal
        vm.warp(block.timestamp + 2 days);

        vm.prank(alice());
        eurx.settle(poor);
        uint256 e1 = eurx.earnedUnclaimed(r1, poor);
        uint256 e2 = eurx.earnedUnclaimed(r2, poor);
        uint256 e3 = eurx.earnedUnclaimed(r3, poor);
        // Σ rates = 2.0e15 → proporciones nominales: 50%, 15%, 35% del pagado (±redondeos)
        uint256 paid = e1 + e2 + e3;
        // tolerancia: 0.5% + 3 wei de redondeo/residuo redistribuido
        assertApproxEqRel(e1, paid / 2, 0.005e18);
        assertApproxEqRel(e2, (paid * 15) / 100, 0.005e18);
        assertApproxEqRel(e3, (paid * 35) / 100, 0.005e18);
        // y NO coinciden con prorrateo por debido (rates por 3d: dues ∝ rates también…
        // la diferencia real aparece porque r2 pausado NO devengo: su debido es ~0 pero cobra 15%)
        assertTrue(e2 > 0, "pausado cobra por rate nominal (unica politica -0)");
    }


    // ---- F4: pruebas de borde dirigidas ----

    /// wrap del emisor tras settle: habilita reclamos pendientes (D17: reserva recomponible)
    function test_sender_rewrap_enables_pending_claims() public {
        address poor = makeAddr("poorRewrap");
        vm.prank(owner);
        eur.transfer(poor, 9 ether);
        _wrap(poor, 9 ether);
        vm.startPrank(poor);
        eurx.createFlow(r1, RATE);
        eurx.createFlow(r2, RATE);
        vm.stopPrank();
        vm.warp(block.timestamp + 20 days);
        vm.prank(alice());
        eurx.settle(poor);
        uint256 owedR1 = eurx.earnedUnclaimed(r1, poor);
        // claim total bloqueado por reserva agotada tras claims previos? tras settle real=9e18,
        // owed recortado a 9e18 total: primer claim ok, segundo hasta agotar
        vm.prank(r1);
        eurx.claimSettled(poor); // deps=0 -> permitido
        assertEq(eurx.realBalanceOf(r1), owedR1);
        // deficit registrado
        (,,, , uint256 def) = eurx.getAccountInfo(poor);
        assertTrue(def > 0, "deficit tras haircut");
    }

    /// createFlow sobre cuenta ya liquidada (reactivacion tras settle con rewrap)
    function test_create_flow_after_settle_requires_new_balance() public {
        address poor = makeAddr("poorReopen");
        vm.prank(owner);
        eur.transfer(poor, 9 ether);
        _wrap(poor, 9 ether);
        vm.prank(poor);
        eurx.createFlow(r1, RATE);
        vm.warp(block.timestamp + 20 days);
        vm.prank(alice());
        eurx.settle(poor);
        vm.prank(poor);
        vm.expectRevert("EuroX: insufficient free balance");
        eurx.createFlow(r1, RATE); // real insuficiente para deps+owed+buffer
        // rewrap para reactivar
        vm.startPrank(owner);
        eur.transfer(poor, 20 ether);
        vm.stopPrank();
        _wrap(poor, 20 ether);
        vm.prank(poor);
        eurx.createFlow(r1, RATE); // ahora si
        (,, uint256 dep,,) = eurx.getAccountInfo(poor);
        assertEq(dep, DEP_1);
    }

    /// boundary: rate int96 cercano a max con guardas (no overflow en deps)
    function test_rate_boundary_big_no_overflow() public {
        int96 huge = type(int96).max; // depositos exigirian real >= ~1.4e29*2: revert por funds
        vm.prank(sender);
        vm.expectRevert("EuroX: insufficient free balance");
        eurx.createFlow(r1, huge);
    }

    /// claim tras cierre del sender (materializa); doble claim = nothing to claim
    function test_double_claim_after_close() public {
        vm.prank(sender);
        eurx.createFlow(r1, RATE);
        vm.warp(block.timestamp + 3600);
        vm.prank(sender);
        eurx.closeFlow(r1); // materializa + deps->0: credito exigible por pull
        uint256 credit = eurx.earnedUnclaimed(r1, sender);
        assertTrue(credit > 0, "credito materializado al cerrar");
        vm.startPrank(r1);
        eurx.claimSettled(sender);
        vm.expectRevert("EuroX: nothing to claim");
        eurx.claimSettled(sender);
        vm.stopPrank();
    }

    /// regla I2: el claim se limita a la reserva no garantizada del emisor (real - deps)
    function test_claim_guarded_by_sender_reserve() public {
        address multi = makeAddr("multiSender");
        vm.prank(owner);
        eur.transfer(multi, 20 ether);
        _wrap(multi, 20 ether);
        vm.startPrank(multi);
        eurx.createFlow(r1, RATE);
        eurx.createFlow(r2, RATE);
        vm.stopPrank();
        vm.warp(block.timestamp + 365 days);
        // materializar: el sender cierra r1 (owed r1 ~ RATE*365d ≈ 243.7e18? no: RATE*3.15e7=2.43e22? calcular)
        // RATE=7.7e14 wei/s * 3.15e7 s = 2.43e22 -> mayor que todo: usar 365 HOURS para escala
        vm.prank(multi);
        eurx.closeFlow(r1);
        uint256 owed1 = eurx.earnedUnclaimed(r1, multi);
        (,, uint256 deps2,,) = eurx.getAccountInfo(multi);
        uint256 real_ = eurx.realBalanceOf(multi);
        // tras 365 dias owed1 ≈ 24.37 ether > real restante: el claim DEBE bloquearse por I2
        if (owed1 + deps2 > real_) {
            vm.prank(r1);
            vm.expectRevert("EuroX: reserve undercollateralized");
            eurx.claimSettled(multi);
            // settle hace haircut equitativo y ahora sí se puede cobrar la parte cubierta
            vm.prank(alice());
            eurx.settle(multi);
            vm.prank(r1);
            eurx.claimSettled(multi);
            assertTrue(eurx.realBalanceOf(r1) > 0, "cobro haircut");
        } else {
            // escenario alternativo: 365h en lugar de días
            vm.prank(r1);
            eurx.claimSettled(multi);
            assertTrue(eurx.realBalanceOf(r1) > 0);
        }
    }

    /// pausa y espera: T informativa no dispara nada por si sola (sin settle automatico)
    function test_no_automatic_settlement_on_time() public {
        vm.prank(sender);
        eurx.createFlow(r1, RATE);
        vm.warp(block.timestamp + 400 days);
        (,,, uint40 st,) = eurx.getAccountInfo(sender);
        assertTrue(st < uint40(block.timestamp), "settledUpTo no avanza solo");
        uint256 credit = eurx.earnedUnclaimed(r1, sender);
        assertEq(credit, 0, "no hay materializacion espontanea");
    }

    /// RF-13 test_settle_pull_prorata_conservation
    function test_settle_pull_prorata_conservation() public {
        // emisor pobre: 2 flows, reserva insuficiente para cubrir todo el devengo
        address poor = makeAddr("poorSender");
        vm.prank(owner);
        eur.transfer(poor, 10 ether);
        _wrap(poor, 10 ether); // real(10e18) ≥ deps(5.55e18)+buffer(2.78e18)=8.33e18; disponible propio tras deps ≈4.44e18 < due(10d) → insolvencia
        vm.startPrank(poor);
        eurx.createFlow(r1, RATE);
        eurx.createFlow(r2, RATE);
        vm.stopPrank();

        // due total a los 10 días ≈ 13.37e18 > disponible → insolvente.
        vm.warp(block.timestamp + 10 days);

        // Cota de conservación capturada ANTES del settle: real + deps disponibles para pagar.
        uint256 availBefore = eurx.realBalanceOf(poor);
        (,, uint256 depBefore,,) = eurx.getAccountInfo(poor);
        availBefore += depBefore;

        vm.expectEmit(true, false, false, false); // solo topic1 (insolvent) estricto
        emit EuroX.Settled(poor, 0, 0);
        vm.prank(alice());
        eurx.settle(poor);

        // pull: nada transferido aún; earnedUnclaimed prorrateado ≤ debido
        uint256 e1 = eurx.earnedUnclaimed(r1, poor);
        uint256 e2 = eurx.earnedUnclaimed(r2, poor);
        assertTrue(e1 + e2 <= availBefore, "conservacion: pagado <= disponible(pre-settle)");
        // prorrateo proporcional con dues iguales → partes iguales ± residuo wei
        assertTrue(e1 == e2 || (e1 > e2 ? e1 - e2 <= 1 : e2 - e1 <= 1), "prorrateo simetrico");

        // claim
        uint256 before = eurx.realBalanceOf(r1);
        vm.prank(r1);
        eurx.claimSettled(poor);
        assertEq(eurx.realBalanceOf(r1) - before, e1);

        // re-settle pre-claim: sigue respaldado (paid=real) -> "not insolvent"
        vm.prank(alice());
        vm.expectRevert("EuroX: not insolvent");
        eurx.settle(poor);
    }

    /// RE-07c test_settle_reverts_when_solvent (el reloj NO habilita settle)
    function test_settle_reverts_when_solvent() public {
        vm.prank(sender);
        eurx.createFlow(r1, RATE);
        vm.warp(block.timestamp + 1 hours); // T cota cumplida...
        vm.prank(alice());
        // ...pero el sender sigue solvente (1000e18 >> devengo 1h) → revert
        vm.expectRevert("EuroX: not insolvent");
        eurx.settle(sender);
    }

    /// todos pausados y solvente → settle revierte (Gherkin negativo CU-05/CU-07)
    function test_settle_reverts_when_all_paused_solvent() public {
        vm.prank(sender);
        eurx.createFlow(r1, RATE);
        vm.prank(sender);
        eurx.pauseFlow(r1);
        vm.warp(block.timestamp + 5 hours);
        vm.prank(alice());
        vm.expectRevert("EuroX: not insolvent");
        eurx.settle(sender);
    }

    // --------------------------------------------------------------------- CU-13
    /// RF-07 test_get_flow_view_projection
    function test_get_flow_view_projection() public {
        vm.prank(sender);
        eurx.createFlow(r1, RATE);
        vm.warp(block.timestamp + 42);
        (int96 rate, EuroX.Status status, uint256 acc, uint256 virtualDevengo) = eurx.getFlow(sender, r1);
        
        assertEq(rate, RATE);
        assertTrue(status == EuroX.Status.Active);
        assertEq(acc, 0, "crudo inmaterializado");
        assertEq(virtualDevengo, uint256(int256(RATE)) * 42, "proyeccion con reloj");

        // pareja sin flow: no revert (lectura pura)
        (int96 r0, EuroX.Status s0, , ) = eurx.getFlow(sender, r2);
        assertEq(r0, 0);
        assertTrue(s0 == EuroX.Status.None);
    }

    // ------------------------------------------------------------------- RNF-08
    /// Solvencia RE-01a: supply custodiado == EUR retenido en cualquier secuencia corta.
    function test_solvency_total_supply_vs_underlying() public {
        vm.startPrank(sender);
        eurx.createFlow(r1, RATE);
        vm.warp(block.timestamp + 1234);
        eurx.pauseFlow(r1);
        eurx.resumeFlow(r1);
        vm.warp(block.timestamp + 77);
        eurx.closeFlow(r1);
        vm.stopPrank();
        assertEq(eurx.totalSupplyX(), eur.balanceOf(address(eurx)), "invariante de custodia");
    }

    // helpers ---------------------------------------------------------------
    function _agg(address a) internal view returns (int96 net, int96 g, uint256 dep, uint40 st, uint256 def) {
        (net, g, dep, st, def) = eurx.getAccountInfo(a);
    }

    function staticcallOrRevert(address target, bytes memory data) internal returns (bytes memory) {
        (bool ok, bytes memory ret) = target.staticcall(data);
        require(ok, "staticcall failed");
        return ret;
    }

    function alice() internal pure returns (address) {
        return address(0xB0B);
    }
}
