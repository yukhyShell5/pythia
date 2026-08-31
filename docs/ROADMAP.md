# Roadmap : Générateur de CFG EVM (Exécution Symbolique Parfaite)

| Statut | Phase | Étape | Description |
| :---: | :--- | :--- | :--- |
| ✅ | **1. Mathématiques** | 1.1 Mapping des Opcodes | Lier les instructions `ADD`, `SUB`, `EQ`, etc. directement à l'API Z3. |
| ✅ | **1. Mathématiques** | 1.2 Injection d'Inconnues | Coder `CALLDATALOAD` pour injecter des variables symboliques libres. |
| ✅ | **1. Mathématiques** | 1.3 Mémoire & Storage | Modéliser la mémoire EVM via un `Z3.Array` pour `MLOAD`/`MSTORE`. |
| ✅ | **2. Contrôle (CFG)** | 2.1 Sauts Conditionnels | Implémenter `JUMPI`, forker les états et tester la faisabilité (SAT). |
| ✅ | **2. Contrôle (CFG)** | 2.2 Sauts Dynamiques | Implémenter `JUMP` en résolvant formellement les adresses inconnues via Z3. |
| ✅ | **2. Contrôle (CFG)** | 2.3 Enregistrement Arêtes | Structurer l'objet Graphe pour exporter les arêtes propres. |
| ✅ | **3. Sécurité** | 3.1 Depth Limit | Tuer les chemins trop longs (boucles infinies). |
| ✅ | **3. Sécurité** | 3.2 Déduplication | Fusionner les états identiques pour alléger le solveur Z3. |
| ✅ | **3. Sécurité** | 3.3 Timeout Z3 | Empêcher le solveur de bloquer sur des hash cryptographiques. |
| ✅ | **4. Exportation** | 4.1 Basic Blocks | Condenser les instructions linéaires en vrais Blocs de Base. |
| ✅ | **4. Exportation** | 4.2 Formats Multiples | Exporter le CFG au format `.dot` (Graphviz) et `.json`. |
| ✅ | **4. Exportation** | 4.3 CLI et Test Grandeur Nature | Génération via index.js avec exports dans le dossier out/. |
