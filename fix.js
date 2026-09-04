const fs = require('fs');
let code = fs.readFileSync('index.js', 'utf8');

// Remove the broken logLevel parsing at line 52
code = code.replace(/    let logLevel = 0;\n    const logIndex = args\.indexOf\("--log-level"\);\n    if \(logIndex !== -1 && args\[logIndex \+ 1\]\) {\n        const parsed = parseInt\(args\[logIndex \+ 1\], 10\);\n        if \(!isNaN\(parsed\)\) {\n            logLevel = parsed;\n        }\n    }\n    global\.logLevel = logLevel;\n/, '');

// Add the correct prune and logLevel parsing back after z3Timeout
code = code.replace(/    let z3Timeout = 100;[\s\S]*?z3Timeout = parsed;\n        }\n    }/, `    let z3Timeout = 100;
    const timeoutIndex = args.indexOf('--z3-timeout');
    if (timeoutIndex !== -1 && args[timeoutIndex + 1]) {
        const parsed = parseInt(args[timeoutIndex + 1], 10);
        if (!isNaN(parsed)) {
            z3Timeout = parsed;
        }
    }

    let prune = args.includes('--prune');

    let logLevel = 0;
    const logIndex = args.indexOf('--log-level');
    if (logIndex !== -1 && args[logIndex + 1]) {
        const parsed = parseInt(args[logIndex + 1], 10);
        if (!isNaN(parsed)) {
            logLevel = parsed;
        }
    }
    global.logLevel = logLevel;`);

// Remove the orphan `    }` that is floating around line 131
code = code.replace(/\n    }\n    global\.logLevel = logLevel;/, '');

fs.writeFileSync('index.js', code);
