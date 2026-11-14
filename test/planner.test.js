const assert = require('assert')
const planner = require('../js/planner.js')

const settings = {
    SetOneAlias: 'super challenging opponents',
    SetOneAbilities: ["Warlock's Rage", 'An Icicle', 'Lens Flare', 'Reflect', 'An Icicle', 'Rejuvenate', '', '', '', ''],
    SetOneAbilityTurns: ['1', '2', '3', '4', '5', '6', '', '', '', ''],
    SetOneWeapons: ['Thunder Sticks', 'Seasonal Attack Pea', 'Seasonal Attack Pea', 'Ghostkerbomb', 'Thyoras Tear', 'Varia is the Bomb', 'Leaded Elemental Vial', 'Wand of the Dark Faerie', '', ''],
    SetOneWeaponTurns: ['1', '1', '2', '4', '5', '', '4', '', '', ''],
    SetOneWeaponReloads: [true, true, true, false, true, false, true, false, false, false],
    raidSdbPin: 'kept',
}

const sap = 'Seasonal Attack Pea'
const shown = step => [step.weapons.map(slot => slot.name).sort().join(' + '), step.ability.name].join(' / ')

let passed = 0
const test = (name, fn) => { fn(); passed++; console.log('ok', name) }

test('simulates the screenshot preset like the bot does', () => {
    const turns = planner.simulate(planner.readPreset(settings, 'SetOne'), 5).map(shown)
    assert.deepStrictEqual(turns, [
        `${sap} + Thunder Sticks / Warlock's Rage`,
        `${sap} + Varia is the Bomb / An Icicle`,
        'Varia is the Bomb + Wand of the Dark Faerie / Lens Flare',
        'Ghostkerbomb + Leaded Elemental Vial / Reflect',
        'Thyoras Tear + Varia is the Bomb / An Icicle',
    ])
})

const plan = {
    turns: [
        { weapons: [sap, sap], ability: 'Lens Flare' },
        { weapons: [sap, 'Thunder Sticks'], ability: "Warlock's Rage" },
        { weapons: [sap, sap], ability: 'An Icicle' },
        { weapons: [sap, 'Leaded Elemental Vial'], ability: 'Reflect' },
        { weapons: [sap, 'Thyoras Tear'], ability: 'An Icicle' },
    ],
    every: { weapons: [sap, sap], ability: 'Rejuvenate' },
}

test('builds a preset that follows the plan', () => {
    const { preset, problems } = planner.buildPreset(plan, 10, { weapons: ['Varia is the Bomb'], abilities: [] }, {})
    assert.deepStrictEqual(problems, [])
    assert.deepStrictEqual(preset.weapons.slice(0, 6), ['Thunder Sticks', 'Leaded Elemental Vial', 'Thyoras Tear', sap, sap, 'Varia is the Bomb'])
    assert.deepStrictEqual(preset.weaponTurns.slice(0, 6), ['2', '4', '5', '', '', ''])
    const turns = planner.simulate(preset, 7)
    plan.turns.forEach((step, index) => {
        assert.ok(planner.sameWeapons(turns[index].weapons.map(slot => slot.name), step.weapons), 'weapons turn ' + (index + 1))
        assert.strictEqual(turns[index].ability.name, step.ability, 'ability turn ' + (index + 1))
    })
    assert.ok(planner.sameWeapons(turns[6].weapons.map(slot => slot.name), [sap, sap]))
    assert.strictEqual(turns[6].ability.name, 'Rejuvenate')
})

test('writePreset only touches the chosen preset', () => {
    const { preset } = planner.buildPreset(plan, 10, { weapons: [], abilities: [] }, {})
    const updated = planner.writePreset(settings, 'SetOne', preset)
    assert.strictEqual(updated.raidSdbPin, 'kept')
    assert.strictEqual(updated.SetOneAlias, settings.SetOneAlias)
    assert.deepStrictEqual(updated.SetOneWeaponReloads, Array(10).fill(false))
})

test('reports a plan that needs more rows than the bot can have', () => {
    const big = { turns: Array.from({ length: 11 }, () => ({ weapons: ['A', 'B'], ability: '' })), every: { weapons: [], ability: '' } }
    const { problems } = planner.buildPreset(big, 10, { weapons: [], abilities: [] }, {})
    assert.ok(problems[0].includes('22 weapon rows'))
})

test('adds rows so the backups fit, never removes any', () => {
    const plan = { turns: [{ weapons: ['A', 'B'], ability: '' }, { weapons: ['C', 'D'], ability: '' }], every: { weapons: ['E', 'F'], ability: '' } }
    const grown = planner.buildPreset(plan, 8, { weapons: ['G', 'H', 'I'], abilities: [] }, {})
    assert.strictEqual(grown.rows, 9)
    assert.deepStrictEqual(grown.problems, [])
    assert.ok(grown.preset.weapons.includes('I'))
    assert.strictEqual(planner.buildPreset(plan, 12, { weapons: [], abilities: [] }, {}).rows, 12)
})

test('flags names that only differ in case', () => {
    const preset = planner.readPreset({ SetTwoWeapons: ['Leaded Elemental Vial', 'seasonal attack pea', sap] }, 'SetTwo')
    assert.strictEqual(planner.nameWarnings(preset).length, 1)
})

test('prefills the editor from what the preset does now', () => {
    const current = planner.planFromPreset(planner.readPreset(settings, 'SetOne'))
    assert.strictEqual(current.turns.length, 6)
    assert.strictEqual(current.turns[0].ability, "Warlock's Rage")
})

test('a once per battle weapon is gone after its first use', () => {
    const preset = planner.readPreset({ SetOneWeapons: ['Tear', 'Pea'], SetOneWeaponTurns: ['', ''] }, 'SetOne')
    const usage = name => name === 'Tear' ? 'Once per Battle' : 'Multiuse'
    const turns = planner.simulate(preset, 2, { weaponUsage: usage })
    assert.deepStrictEqual(turns[0].weapons.map(slot => slot.name), ['Tear', 'Pea'])
    assert.deepStrictEqual(turns[1].weapons.map(slot => slot.name), ['Pea', ''])
    assert.strictEqual(turns[0].weapons[0].usage, 'Once per Battle')
})

test('copies are counted for the busiest turn', () => {
    const { preset } = planner.buildPreset(plan, 10, { weapons: [], abilities: [] }, {})
    const usage = name => name === 'Thyoras Tear' ? 'Once per Battle' : 'Multiuse'
    const turns = planner.simulate(preset, 6, { weaponUsage: usage })
    assert.ok(turns[4].weapons.some(slot => slot.name === 'Thyoras Tear'))
    assert.ok(planner.sameWeapons(turns[5].weapons.map(slot => slot.name), [sap, sap]))
})

const { abilityInfo } = require('../js/abilities.js')

test('abilities are found by name even without the apostrophe', () => {
    assert.strictEqual(abilityInfo('Warlocks Rage').name, "Warlock's Rage")
    assert.strictEqual(abilityInfo('Lens Flare').limit, 'battle')
    assert.strictEqual(abilityInfo('Nonsense'), null)
})

test('a once per battle ability is not picked again, a cooldown waits its turns', () => {
    const preset = planner.readPreset({ SetOneAbilities: ['Lens Flare', 'Sear', 'Static Cling'], SetOneAbilityTurns: ['', '', ''] }, 'SetOne')
    const turns = planner.simulate(preset, 5, { ability: abilityInfo }).map(step => step.ability.name)
    // Lens Flare once, Sear then 2 turns of cooldown filled by Static Cling, then Sear again
    assert.deepStrictEqual(turns, ['Lens Flare', 'Sear', 'Static Cling', 'Static Cling', 'Sear'])
})

test('the fixed screenshot plan still works with ability rules', () => {
    const { preset } = planner.buildPreset(plan, 10, { weapons: [], abilities: [] }, {})
    const turns = planner.simulate(preset, 5, { ability: abilityInfo })
    plan.turns.slice(0, 5).forEach((step, index) => assert.strictEqual(turns[index].ability.name, step.ability, 'turn ' + (index + 1)))
})

const { weaponInfo } = require('../js/weapons.js')
const weaponUsage = name => (weaponInfo(name) || {}).usage || ''

test('weapons are found by name and only valid ones are listed', () => {
    assert.strictEqual(weaponInfo("Thyora's Tear").name, 'Thyoras Tear')
    assert.strictEqual(weaponInfo('Thyoras Tear').usage, 'Once per Battle')
    // Saved pictures load from img/weapons/, the rest from Neopets
    assert.strictEqual(weaponInfo('Super Attack Pea').image, 'img/weapons/bd_superpea.gif')
    const notSaved = require('../js/weapons.js').weaponNames.find(name => !weaponInfo(name).image.startsWith('img/'))
    assert.ok(weaponInfo(notSaved).image.startsWith('https://images.neopets.com/items/'))
    assert.strictEqual(weaponInfo('Advisor Broos Hat'), null)
})

test('the screenshot preset with the real weapon list stops reusing once per battle weapons', () => {
    const preset = planner.readPreset(settings, 'SetOne')
    const turns = planner.simulate(preset, 6, { weaponUsage, ability: abilityInfo })
    const thunder = turns.filter(step => step.weapons.some(pick => pick.name === 'Thunder Sticks')).map(step => step.turn)
    assert.deepStrictEqual(thunder, [1])
})

test('fragile once per battle weapons count as used up', () => {
    const preset = planner.readPreset({ SetOneWeapons: ['Shield of Reflection', sap], SetOneWeaponTurns: ['', ''] }, 'SetOne')
    const turns = planner.simulate(preset, 2, { weaponUsage })
    assert.ok(turns[0].weapons.some(pick => pick.name === 'Shield of Reflection'))
    assert.ok(!turns[1].weapons.some(pick => pick.name === 'Shield of Reflection'))
})

test('a misspelled weapon gets a suggestion, a known one no warning', () => {
    const known = { weapon: { info: weaponInfo, names: require('../js/weapons.js').weaponNames }, ability: { info: abilityInfo, names: require('../js/abilities.js').abilityNames } }
    const preset = planner.readPreset({ SetOneWeapons: ['Ghoskerbomb', 'Thyora\'s Tear', 'Zzzz Qqqq'], SetOneAbilities: ['Lens Flare'] }, 'SetOne')
    const warnings = planner.unknownNameWarnings(preset, known)
    assert.strictEqual(warnings.length, 2)
    assert.strictEqual(warnings[0].suggestion, 'Ghostkerbomb')
    assert.ok(warnings[0].text.includes('Did you mean "Ghostkerbomb"?'))
    assert.strictEqual(warnings[1].suggestion, '')
})

test('a plan survives a share link, numbers for known items and text for the rest', () => {
    const weapons = require('../js/weapons.js')
    const abilities = require('../js/abilities.js')
    const catalog = { weapon: { info: weapons.weaponInfo, byId: weapons.weaponById }, ability: { info: abilities.abilityInfo, byId: abilities.abilityById } }
    const shared = {
        turns: [{ weapons: ['Ghostkerbomb', 'Leaded Elemental Vial'], ability: 'Lens Flare' }, { weapons: ['My_Odd.Weapon~1', ''], ability: '' }],
        every: { weapons: [sap, sap], ability: "Warlock's Rage" },
    }
    const text = planner.encodePlan(shared, { 'Leaded Elemental Vial': true }, catalog)
    assert.ok(text.startsWith('plan=f_'), text)
    const back = planner.decodePlan('#' + text, catalog)
    assert.deepStrictEqual(back.plan, shared)
    assert.deepStrictEqual(back.reloads, { 'Leaded Elemental Vial': true })
    assert.strictEqual(planner.decodePlan('#nothing', catalog), null)
})

console.log(`${passed} tests passed`)
