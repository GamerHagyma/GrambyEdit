import { realCatalog } from '../helpers/real-catalog';
test('Spoiler has a bottom mount and top socket despite the incomplete native inventory', async () => {
  const cat = await realCatalog(),
    p = cat.parts.Spoiler;
  expect(p.childSockets).toEqual(['2']);
  expect(p.parentSockets).toEqual(['2']);
  expect(p.defaultMount).toBe('2');
  expect(p.sockets['2'].childFrame![1]).toBeCloseTo(-0.2650869489);
  expect(p.sockets['2'].frame[1]).toBeCloseTo(0.2102582455);
  expect(p.sockets['2'].frameSource).toBe('captured');
});
test('reported non-spawnable parts have their own category, with working splitter variants unaffected', async () => {
  const cat = await realCatalog();
  for (const type of [
    'Winch',
    'UFO',
    'Tap',
    'SnowglobeCrack',
    'Skraken',
    'RotateTool',
    'ResizeTool',
    'PaintTool',
    'NewspaperYibYib',
    'M80',
    'JetEngine',
    'Hose',
    'GoKart',
    'Firework_Boomer',
    'ExplosiveYibYib',
    'Dice',
    'DeleteTool',
    'CloneTool',
    'BuildTool',
    'BaseballBat',
    'BadTooth',
    'Splitter',
  ])
    expect(cat.parts[type]?.category, type).toBe('Unavailable');
  for (const type of ['Splitter_1', 'Splitter_2', 'Splitter_3', 'Splitter_4'])
    expect(cat.parts[type].category).not.toBe('Unavailable');
});
