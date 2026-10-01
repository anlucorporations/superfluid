// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console, console2} from "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {Euro} from "../src/Euro.sol";
import {EuroxFactory} from "../src/EuroxFactory.sol";
import {EuroX} from "../src/EuroX.sol";

/// CU-10 / RF-10: despliega EUR + EuroxFactory + par EURx y escribe el registro
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

        Euro eur = new Euro(INITIAL_SUPPLY);
        EuroxFactory factory = new EuroxFactory();
        address eurxAddr = factory.createPair(address(eur), "Euro Streaming (test)", "EURx");
        EuroX eurx = EuroX(eurxAddr);

        vm.stopBroadcast();

        // Registro de deployment atómico (ruta canónica §2.3 doc técnico)
        string memory j = string.concat(
            "{\n",
            '  "network": "Codecrypto-Besu",\n',
            '  "networkId": ', vm.toString(block.chainid), ",\n",
            '  "chainId": ', vm.toString(block.chainid), ",\n",
            '  "timestamp": ', vm.toString(block.timestamp), ",\n",
            '  "deployer": "', vm.toString(deployer), '",\n',
            '  "EUR": "', vm.toString(address(eur)), '",\n',
            '  "FACTORY": "', vm.toString(address(factory)), '",\n',
            '  "EURx": "', vm.toString(address(eurx)), '",\n',
            '  "flowRateWeiPerSec": "771604938271604"\n',
            "}\n"
        );
        vm.writeJson(j, "deployments/codecrypto.json"); // RE-10: sin catch silencioso

        console.log("EUR ", address(eur));
        console.log("FAC ", address(factory));
        console.log("EURx", address(eurx));
    }
}
