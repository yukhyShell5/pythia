const STACK_EFFECTS = {
    // Math & Logic
    0x00: [0, 0], 0x01: [2, 1], 0x02: [2, 1], 0x03: [2, 1], 0x04: [2, 1], 0x05: [2, 1], 0x06: [2, 1], 0x07: [2, 1],
    0x08: [3, 1], 0x09: [3, 1], 0x0a: [2, 1], 0x0b: [2, 1],
    0x10: [2, 1], 0x11: [2, 1], 0x12: [2, 1], 0x13: [2, 1], 0x14: [2, 1], 0x15: [1, 1], 0x16: [2, 1],
    0x17: [2, 1], 0x18: [2, 1], 0x19: [1, 1], 0x1a: [2, 1], 0x1b: [2, 1], 0x1c: [2, 1], 0x1d: [2, 1],
    0x20: [2, 1],
    // Environment
    0x30: [0, 1], 0x31: [1, 1], 0x32: [0, 1], 0x33: [0, 1], 0x34: [0, 1],
    0x35: [1, 1], 0x36: [0, 1], 0x37: [3, 0], 0x38: [0, 1],
    0x39: [3, 0], 0x3a: [0, 1], 0x3b: [1, 1], 0x3c: [4, 0],
    0x3d: [0, 1], 0x3e: [3, 0], 0x3f: [1, 1],
    0x40: [1, 1], 0x41: [0, 1], 0x42: [0, 1], 0x43: [0, 1], 0x44: [0, 1],
    0x45: [0, 1], 0x46: [0, 1], 0x47: [0, 1], 0x48: [0, 1], 0x49: [1, 1], 0x4a: [0, 1],
    // Stack, Memory, Storage
    0x50: [1, 0], 0x51: [1, 1], 0x52: [2, 0], 0x53: [2, 0], 0x54: [1, 1], 0x55: [2, 0],
    0x56: [1, 0], 0x57: [2, 0], 0x58: [0, 1], 0x59: [0, 1], 0x5a: [0, 1], 0x5b: [0, 0], 0x5f: [0, 1],
    0x5c: [1, 1], 0x5d: [2, 0], 0x5e: [3, 0],
    // Logging
    0xa0: [2, 0], 0xa1: [3, 0], 0xa2: [4, 0], 0xa3: [5, 0], 0xa4: [6, 0],
    // System
    0xf0: [3, 1], 0xf1: [7, 1], 0xf2: [7, 1], 0xf3: [2, 0], 0xf4: [6, 1],
    0xf5: [4, 1], 0xfa: [6, 1], 0xfd: [2, 0], 0xfe: [0, 0], 0xff: [1, 0]
};

function getStackEffect(opcode) {
    if (STACK_EFFECTS[opcode]) return STACK_EFFECTS[opcode];
    if (opcode >= 0x60 && opcode <= 0x7f) return [0, 1]; // PUSH
    if (opcode >= 0x80 && opcode <= 0x8f) return [opcode - 0x80 + 1, opcode - 0x80 + 2]; // DUP (pops n, pushes n+1 equivalent, but we usually just say pops 0 pushes 1... actually DUP doesn't pop, it just reads. But for stack sync, standard EVM says DUP1 requires 1 element on stack, pushes 1 element, so net is +1. Wait, if we use it for pop/push: DUP1 requires stack of size >=1, pops 0, pushes 1. Wait, if it pops 0 and pushes 1, then the popped elements are not removed. Let's just say pops 0, pushes 1, BUT requires stack > (opcode - 0x80)
    // Actually, for dummy fallback, we just need the net effect or exact pop/push.
    // If DUP1 pops 0 and pushes 1, it's [0, 1].
    // SWAP1 pops 0, pushes 0. (Requires 2). [0, 0].
    return [0, 0]; // Default fallback if really unknown
}
module.exports = { getStackEffect };
