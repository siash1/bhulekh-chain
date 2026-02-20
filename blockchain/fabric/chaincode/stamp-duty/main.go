// Package main is the entry point for the stamp-duty chaincode.
// It creates and starts the BhulekhChain Stamp Duty smart contract
// on the Hyperledger Fabric network. This chaincode manages circle
// rates and stamp duty calculations, kept separate from the land
// registry chaincode because stamp duty rates vary by state and
// change frequently.
package main

import (
	"log"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

func main() {
	stampDutyChaincode, err := contractapi.NewChaincode(&StampDutyContract{})
	if err != nil {
		log.Panicf("Error creating stamp-duty chaincode: %v", err)
	}

	stampDutyChaincode.Info.Title = "BhulekhChain Stamp Duty"
	stampDutyChaincode.Info.Description = "National Blockchain Property Register - Stamp Duty & Circle Rate Chaincode"
	stampDutyChaincode.Info.Version = "1.0.0"

	if err := stampDutyChaincode.Start(); err != nil {
		log.Panicf("Error starting stamp-duty chaincode: %v", err)
	}
}
