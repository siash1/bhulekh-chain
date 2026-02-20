import { ethers, upgrades, run, network } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("=".repeat(60));
  console.log("BhulekhChain Polygon Contracts Deployment");
  console.log("=".repeat(60));
  console.log(`Network:  ${network.name}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(
    `Balance:  ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} MATIC`
  );
  console.log("-".repeat(60));

  // ============================================================
  // 1. Deploy TitleDeedNFT as UUPS Proxy
  // ============================================================
  console.log("\n[1/2] Deploying TitleDeedNFT (UUPS Proxy)...");

  const TitleDeedNFT = await ethers.getContractFactory("TitleDeedNFT");
  const titleDeedNFT = await upgrades.deployProxy(
    TitleDeedNFT,
    [deployer.address], // initialize(govAdmin)
    {
      initializer: "initialize",
      kind: "uups",
    }
  );

  await titleDeedNFT.waitForDeployment();
  const titleDeedAddress = await titleDeedNFT.getAddress();

  console.log(`  Proxy address:          ${titleDeedAddress}`);
  const implAddress = await upgrades.erc1967.getImplementationAddress(
    titleDeedAddress
  );
  console.log(`  Implementation address: ${implAddress}`);

  // ============================================================
  // 2. Deploy FractionalOwnership
  // ============================================================
  console.log("\n[2/2] Deploying FractionalOwnership...");

  const FractionalOwnership = await ethers.getContractFactory(
    "FractionalOwnership"
  );
  const fractionalOwnership = await FractionalOwnership.deploy(
    titleDeedAddress,
    deployer.address
  );

  await fractionalOwnership.waitForDeployment();
  const fractionalAddress = await fractionalOwnership.getAddress();

  console.log(`  Contract address: ${fractionalAddress}`);

  // ============================================================
  // Summary
  // ============================================================
  console.log("\n" + "=".repeat(60));
  console.log("Deployment Complete!");
  console.log("=".repeat(60));
  console.log(`  TitleDeedNFT (Proxy):     ${titleDeedAddress}`);
  console.log(`  TitleDeedNFT (Impl):      ${implAddress}`);
  console.log(`  FractionalOwnership:      ${fractionalAddress}`);
  console.log("=".repeat(60));

  // ============================================================
  // Verify on Explorer (skip for local/hardhat networks)
  // ============================================================
  if (network.name !== "hardhat" && network.name !== "localhost") {
    console.log("\nWaiting for block confirmations before verification...");
    // Wait for a few blocks for the explorer to index
    await new Promise((resolve) => setTimeout(resolve, 30_000));

    try {
      console.log("\nVerifying TitleDeedNFT implementation...");
      await run("verify:verify", {
        address: implAddress,
        constructorArguments: [],
      });
      console.log("  TitleDeedNFT verified successfully.");
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error);
      if (message.includes("Already Verified")) {
        console.log("  TitleDeedNFT already verified.");
      } else {
        console.error("  TitleDeedNFT verification failed:", message);
      }
    }

    try {
      console.log("\nVerifying FractionalOwnership...");
      await run("verify:verify", {
        address: fractionalAddress,
        constructorArguments: [titleDeedAddress, deployer.address],
      });
      console.log("  FractionalOwnership verified successfully.");
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error);
      if (message.includes("Already Verified")) {
        console.log("  FractionalOwnership already verified.");
      } else {
        console.error(
          "  FractionalOwnership verification failed:",
          message
        );
      }
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
