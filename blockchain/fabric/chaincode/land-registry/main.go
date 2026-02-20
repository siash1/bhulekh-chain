// Package main is the entry point for the land-registry chaincode.
// It creates and starts the BhulekhChain Land Registry smart contract
// on the Hyperledger Fabric network.
package main

import (
	"log"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

func main() {
	landRegistryChaincode, err := contractapi.NewChaincode(&LandRegistryContract{})
	if err != nil {
		log.Panicf("Error creating land-registry chaincode: %v", err)
	}

	landRegistryChaincode.Info.Title = "BhulekhChain Land Registry"
	landRegistryChaincode.Info.Description = "National Blockchain Property Register - Land Registry Chaincode"
	landRegistryChaincode.Info.Version = "1.0.0"

	if err := landRegistryChaincode.Start(); err != nil {
		log.Panicf("Error starting land-registry chaincode: %v", err)
	}
}
