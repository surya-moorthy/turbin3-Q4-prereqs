import {
  address,
  appendTransactionMessageInstructions,
  assertIsTransactionWithinSizeLimit,
  compileTransaction,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  devnet,
  getSignatureFromTransaction,
  lamports,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type TransactionMessageBytesBase64
} from "@solana/kit";

import { getTransferSolInstruction } from "@solana-program/system";
import wallet from "./dev-wallet.json";

// 1 SOL = 1_000_000_000 lamports
const LAMPORTS_PER_SOL = BigInt(1_000_000_000);

// Load keypair
const keypair = await createKeyPairSignerFromBytes(new Uint8Array(wallet));

// Destination wallet (Turbin3)
const turbin3Wallet = address('G7MTCM2S1W6ufPhYLjodUyRZLBFbPz91CXd5C63aWoqV');

// RPC connections
const rpc = createSolanaRpc(devnet("https://api.devnet.solana.com"));
const rpcSubscriptions = createSolanaRpcSubscriptions(devnet('wss://api.devnet.solana.com'));

// --- Step 1: Get balance ---
const { value: balance } = await rpc.getBalance(keypair.address).send();

// --- Step 2: Build dummy transfer (0 lamports) to calculate fee ---
const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

const dummyTransferInstruction = getTransferSolInstruction({
  source: keypair,
  destination: turbin3Wallet,
  amount: lamports(0n)
});

const dummyTransactionMessage = pipe(
  createTransactionMessage({ version: 0 }),
  tx => setTransactionMessageFeePayerSigner(keypair, tx),
  tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
  tx => appendTransactionMessageInstructions([dummyTransferInstruction], tx)
);

// Compile dummy tx and encode
const compiledDummy = compileTransaction(dummyTransactionMessage);
const dummyMessageBase64 = Buffer.from(compiledDummy.messageBytes).toString("base64") as TransactionMessageBytesBase64;

// --- Step 3: Get fee for transaction ---
const { value: fee } = await rpc.getFeeForMessage(dummyMessageBase64).send();
if (fee === null) throw new Error("Unable to calculate transaction fee");

// --- Step 4: Ensure balance covers fee ---
if (balance < fee) {
  throw new Error(`Insufficient balance. Balance: ${balance}, Fee: ${fee}`);
}

// --- Step 5: Calculate max sendable amount ---
const sendAmount = balance - fee;
console.log(`Wallet balance: ${balance}, Fee: ${fee}, Sending: ${sendAmount} lamports`);

// --- Step 6: Create actual transfer instruction ---
const transferInstruction = getTransferSolInstruction({
  source: keypair,
  destination: turbin3Wallet,
  amount: lamports(sendAmount)
});

// --- Step 7: Build & sign transaction ---
const transactionMessage = pipe(
  createTransactionMessage({ version: 0 }),
  tx => setTransactionMessageFeePayerSigner(keypair, tx),
  tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
  tx => appendTransactionMessageInstructions([transferInstruction], tx)
);

const signedTransaction = await signTransactionMessageWithSigners(transactionMessage);
assertIsTransactionWithinSizeLimit(signedTransaction);

// --- Step 8: Send & confirm ---
const sendAndConfirmTransaction = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });

try {
  await sendAndConfirmTransaction(signedTransaction, { commitment: "confirmed" });
  const signature = getSignatureFromTransaction(signedTransaction);
  console.log(`Success! Explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
} catch (e) {
  console.error(" Transfer failed:", e);
}
