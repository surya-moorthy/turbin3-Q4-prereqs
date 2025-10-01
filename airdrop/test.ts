import bs58 from 'bs58';
import promptSync from 'prompt-sync';

const prompt = promptSync();

/**
 * Converts a Base58 string to a wallet (byte array)
 */
function base58ToWallet() {
    const base58 = prompt('Enter Base58 string: ');
    try {
        const wallet = bs58.decode(base58);
        console.log('Wallet bytes:', wallet);
    } catch (err) {
        console.error('Invalid Base58 string.');
    }
}

base58ToWallet()