// The mini SWF omits the female outfit-7 arm blades present in perso.swf.
// Reuse its own blade (467 -> shape 466), with the portrait's local attachment
// matrix and col3 binding. Keep the original basic frames unchanged.
function addClothingDetails(symbols) {
  const blade = {
    name: 'Symbol467', colorIdx: '_col3', transform: { tx: 7.15, ty: -5.6 },
  };
  const firstId = Math.max(...symbols.keys()) + 1;
  symbols.set(firstId, {
    type: 'symbol', name: `Symbol${firstId}`,
    parts: [{ type: 'symbol', name: 'Symbol467' }],
    frames: [[], [blade]],
  });
  // Match the bone artwork and placement matrices, not numeric ID order:
  // portrait forearms 481/735 correspond to mini 574/842. Mini 831 is an
  // upper arm (portrait 748); attaching there shifts the blade off the wrist.
  for (const id of [574, 842]) {
    const arm = symbols.get(id);
    const name = `Symbol${firstId}`;
    arm.parts.push({ type: 'symbol', name });
    arm.frames[6].unshift({
      name, partIdx: '_p1', transform: { tx: -0.45, ty: 3.35 },
    });
  }
}

module.exports = { addClothingDetails };
