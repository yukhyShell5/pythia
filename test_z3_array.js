const { init } = require('z3-solver');

async function main() {
    const { Context } = await init();
    const z3 = new Context('main');
    
    // Sorts
    const BitVec256 = z3.BitVecSort(256);
    
    // Create an array
    let mem = z3.Array.empty(BitVec256, BitVec256);
    let mem2 = z3.Array('Mem2', BitVec256, BitVec256);
    
    // Store
    let index = z3.BitVec.val(0, 256);
    let val = z3.BitVec.val(0xff, 256);
    mem = mem.store(index, val);
    
    // Select
    let readVal = mem.select(index);
    
    console.log(readVal.toString());
}
main();
