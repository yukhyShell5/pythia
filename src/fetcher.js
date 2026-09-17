async function rpcCall(rpcUrl, method, params) {
    const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.result;
}

/**
 * Télécharge le bytecode d'un contrat via RPC.
 * Détecte automatiquement si le contrat est un proxy EIP-1967 (upgradable)
 * et résout l'adresse de l'implémentation logique sous-jacente.
 */
async function fetchBytecode(address, rpcUrl) {
    if (globalThis.logLevel >= 1) console.log(`[Fetcher] Interrogation RPC pour ${address}...`);
    
    // Slot de stockage standard pour l'implémentation des proxies EIP-1967
    const EIP1967_IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
    let targetAddress = address;

    try {
        const storage = await rpcCall(rpcUrl, "eth_getStorageAt", [address, EIP1967_IMPL_SLOT, "latest"]);
        
        // Le storage renvoie 32 octets. L'adresse est sur les 20 derniers octets.
        if (storage && storage !== "0x" && storage.replace(/0x0+/, '') !== "") {
            const implAddress = "0x" + storage.slice(-40);
            if (implAddress !== "0x0000000000000000000000000000000000000000") {
                if (globalThis.logLevel >= 1) console.log(`[Fetcher] 🛡️ Proxy EIP-1967 détecté ! Résolution de l'implémentation (Upgrade) vers : ${implAddress}`);
                targetAddress = implAddress;
            }
        }
    } catch (e) {
        if (globalThis.logLevel >= 1) console.log(`[Fetcher] Attention: Impossible de vérifier le slot EIP-1967 (${e.message})`);
    }

    if (globalThis.logLevel >= 1) console.log(`[Fetcher] Téléchargement du bytecode pour ${targetAddress}...`);
    const bytecode = await rpcCall(rpcUrl, "eth_getCode", [targetAddress, "latest"]);
    
    if (!bytecode || bytecode === "0x") {
        throw new Error(`Aucun bytecode (contrat vide) à l'adresse ${targetAddress}`);
    }
    
    return bytecode.replace('0x', '');
}

module.exports = { fetchBytecode };
