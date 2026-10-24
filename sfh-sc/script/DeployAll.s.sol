// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console, console2} from "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {BarloventoToken} from "../src/BarloventoToken.sol";
import {BarloventoFactory} from "../src/BarloventoFactory.sol";
import {BarloventoTx} from "../src/BarloventoTx.sol";

/// CU-10 / RF-10: despliega BRLT + BarloventoFactory + par BRLTx y escribe el registro
/// canónico out/deployments/codecrypto.json (networkId + timestamp; RNF-07 idempotente).
contract DeployAllScript is Script {
    using stdJson for string;

    uint256 internal constant INITIAL_SUPPLY = 10_000_000e18;

    function run() public {
        require(block.chainid == 81234, "preflight: chainId != Codecrypto(81234)");
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        require(deployer.balance >= 5 ether, "preflight: saldo CC < 5 (usa el faucet)");

        vm.startBroadcast(pk);

        BarloventoToken eur = new BarloventoToken(INITIAL_SUPPLY);
        BarloventoFactory factory = new BarloventoFactory();
        address eurxAddr = factory.createPair(address(eur), "Barlovento Tx (test)", "BRLTx");
        BarloventoTx eurx = BarloventoTx(eurxAddr);

        vm.stopBroadcast();

        // Registro de deployment atómico (ruta canónica §2.3 doc técnico)
        string memory j = string.concat(
            "{\n",
            '  "network": "Codecrypto-Besu",\n',
            '  "networkId": ', vm.toString(block.chainid), ",\n",
            '  "chainId": ', vm.toString(block.chainid), ",\n",
            '  "timestamp": ', vm.toString(block.timestamp), ",\n",
            '  "deployer": "', vm.toString(deployer), '",\n',
            '  "BRLT": "', vm.toString(address(eur)), '",\n',
            '  "FACTORY": "', vm.toString(address(factory)), '",\n',
            '  "BRLTx": "', vm.toString(address(eurx)), '",\n',
            '  "flowRateWeiPerSec": "500000000000000"\n',
            "}\n"
        );
        vm.writeJson(j, "deployments/codecrypto.json"); // RE-10: sin catch silencioso

        console.log("BRLT ", address(eur));
        console.log("FAC ", address(factory));
        console.log("BRLTx", address(eurx));
    }
}
