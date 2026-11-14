// Battledome Autofighter planner logic. No DOM here, so it runs in the browser and in node tests.
// The selection rules mirror the Autofighter's ability and weapon choice; keep them in sync.

const presetIds = ['Default', 'SetOne', 'SetTwo', 'SetThree']
const defaultAliases = { Default: 'Default', SetOne: 'Set 1', SetTwo: 'Set 2', SetThree: 'Set 3' }

function rowCount(settings) {
    return parseInt(settings.maxAWLines) || 10
}

// The Autofighter's "+ Add Row" stops at 20 rows
const maxRows = 20

function presetLabel(settings, id) {
    return (id !== 'Default' && settings[id + 'Alias']) || defaultAliases[id]
}

function padRows(rows, count, filler) {
    const result = (rows || []).slice(0, count)
    while (result.length < count) result.push(filler)
    return result
}

function readPreset(settings, id) {
    const count = rowCount(settings)
    return {
        abilities: padRows(settings[id + 'Abilities'], count, ''),
        abilityTurns: padRows(settings[id + 'AbilityTurns'], count, ''),
        weapons: padRows(settings[id + 'Weapons'], count, ''),
        weaponTurns: padRows(settings[id + 'WeaponTurns'], count, ''),
        weaponReloads: padRows(settings[id + 'WeaponReloads'], count, false),
    }
}

// Returns a copy of the settings with only this preset's rows replaced
function writePreset(settings, id, preset) {
    return {
        ...settings,
        [id + 'Abilities']: preset.abilities,
        [id + 'AbilityTurns']: preset.abilityTurns,
        [id + 'Weapons']: preset.weapons,
        [id + 'WeaponTurns']: preset.weaponTurns,
        [id + 'WeaponReloads']: preset.weaponReloads,
    }
}

const cleanName = name => (name || '').trimEnd()

function weaponCopies(preset) {
    const perTurn = {}
    const anyTurn = {}
    preset.weapons.map(cleanName).forEach((name, index) => {
        if (!name) return
        const turn = preset.weaponTurns[index]
        if (!turn) anyTurn[name] = (anyTurn[name] || 0) + 1
        else {
            perTurn[name] = perTurn[name] || {}
            perTurn[name][turn] = (perTurn[name][turn] || 0) + 1
        }
    })
    const copies = {}
    Object.keys(anyTurn).concat(Object.keys(perTurn)).forEach(name => {
        const busiest = Math.max(0, ...Object.values(perTurn[name] || {}))
        copies[name] = (anyTurn[name] || 0) + busiest
    })
    return copies
}

const goneAfterUse = ['Single Use', 'Once per Battle', 'Fragile Once Per Battle']

function pickAbility(preset, turn, spent, coolingUntil) {
    const names = preset.abilities.map(cleanName)
    const turns = preset.abilityTurns
    const ready = name => name && !(spent || []).includes(name) && !((coolingUntil || {})[name] >= turn)
    const available = names.filter(ready)
    // 1) the row reserved for this turn
    const reservedIndex = turns.findIndex(value => parseInt(value) === turn)
    const reserved = reservedIndex >= 0 ? names[reservedIndex] : ''
    if (reserved) {
        const found = available.find(name => name.includes(reserved))
        if (found) return { name: found, row: reservedIndex, how: 'reserved' }
    }
    // 2) rows with no turn, in order
    const genericIndex = names.findIndex((name, index) => ready(name) && !turns[index])
    if (genericIndex >= 0) return { name: names[genericIndex], row: genericIndex, how: 'filler' }
    // 3) borrow any row
    const borrowedIndex = names.findIndex(ready)
    if (borrowedIndex >= 0) return { name: names[borrowedIndex], row: borrowedIndex, how: 'borrowed' }
    return { name: '', row: -1, how: 'none' }
}

function pickWeapons(preset, turn, spent) {
    const names = preset.weapons.map(cleanName)
    const turns = preset.weaponTurns
    const inventory = weaponCopies(preset)
    Object.keys(spent || {}).forEach(name => inventory[name] -= spent[name])
    const isAvailable = name => name && inventory[name] > 0
    const reservedRows = turns.map((value, index) => value === String(turn) ? index : -1).filter(index => index >= 0)
    let reservedUsed = 0
    const slots = []

    for (let slot = 0; slot < 2; slot++) {
        let pick = null
        // 1) the rows reserved for this turn, one per slot
        if (reservedUsed < reservedRows.length) {
            const row = reservedRows[reservedUsed++]
            const reserved = names[row]
            const found = reserved && Object.keys(inventory).find(name => inventory[name] > 0 && name.includes(reserved))
            if (found) pick = { name: found, row, how: 'reserved' }
        }
        // 2) rows with no turn, in order
        if (!pick) {
            const row = names.findIndex((name, index) => !turns[index] && isAvailable(name))
            if (row >= 0) pick = { name: names[row], row, how: 'filler' }
        }
        // 3) a row for a turn already played, or any row while both slots are still empty
        if (!pick) {
            let row = names.findIndex((name, index) => parseInt(turns[index]) < turn && isAvailable(name))
            if (row < 0 && slots.length === 0) row = names.findIndex(isAvailable)
            if (row >= 0) pick = { name: names[row], row, how: 'borrowed' }
        }
        if (pick) {
            inventory[pick.name]--
            pick.reload = !!preset.weaponReloads[pick.row]
            slots.push(pick)
        } else {
            slots.push({ name: '', row: -1, how: 'none' })
        }
    }
    return slots
}

// info.weaponUsage(name): 'Multiuse', 'Single Use', ... or '' when unknown
// info.ability(name): { limit: 'battle' | 'day' | '', cooldown: turns } or null when unknown
function simulate(preset, turnCount, info) {
    const weaponUsage = (info && info.weaponUsage) || (() => '')
    const abilityRules = (info && info.ability) || (() => null)
    const spentWeapons = {}
    const spentAbilities = []
    const coolingUntil = {}
    const result = []
    for (let turn = 1; turn <= turnCount; turn++) {
        const weapons = pickWeapons(preset, turn, spentWeapons)
        weapons.forEach(pick => {
            if (!pick.name) return
            pick.usage = weaponUsage(pick.name)
            if (goneAfterUse.includes(pick.usage)) spentWeapons[pick.name] = (spentWeapons[pick.name] || 0) + 1
        })
        const ability = pickAbility(preset, turn, spentAbilities, coolingUntil)
        const rules = ability.name ? abilityRules(ability.name) : null
        if (rules) {
            ability.rules = rules
            if (rules.limit) spentAbilities.push(ability.name)
            if (rules.cooldown) coolingUntil[ability.name] = turn + rules.cooldown
        }
        result.push({ turn, weapons, ability })
    }
    return result
}

function lastConfiguredTurn(preset) {
    const all = preset.abilityTurns.concat(preset.weaponTurns).map(value => parseInt(value)).filter(value => value > 0)
    return all.length ? Math.max(...all) : 0
}

function sameWeapons(a, b) {
    const sortPair = pair => pair.map(cleanName).filter(Boolean).sort().join('|')
    return sortPair(a) === sortPair(b)
}

function subtract(from, taken) {
    const rest = from.slice()
    for (const name of taken) {
        const index = rest.indexOf(name)
        if (index < 0) return null
        rest.splice(index, 1)
    }
    return rest
}

// plan: { turns: [{ weapons: [a, b], ability }], every: { weapons: [a, b], ability } }
// `every` is what the bot uses on any turn not in the list (and after the last one).
// backups: { weapons: [], abilities: [] } kept as plain filler rows after the plan's rows.
// reloads: { weaponName: true } rows naming that weapon get the reload checkbox.
function buildPreset(plan, count, backups, reloads) {
    const problems = []
    const every = {
        weapons: (plan.every.weapons || []).map(cleanName).filter(Boolean),
        ability: cleanName(plan.every.ability),
    }

    const weaponRows = []
    const abilityRows = []
    plan.turns.forEach((step, index) => {
        const turn = String(index + 1)
        const wanted = (step.weapons || []).map(cleanName).filter(Boolean)
        // Let the filler rows cover as many slots as they would on their own; reserve the rest
        let reserved = wanted
        for (let take = Math.min(2, every.weapons.length); take > 0; take--) {
            const rest = subtract(wanted, every.weapons.slice(0, take))
            if (rest && rest.length + take <= 2) { reserved = rest; break }
        }
        reserved.forEach(name => weaponRows.push({ name, turn }))

        const ability = cleanName(step.ability)
        if (ability && ability !== every.ability) abilityRows.push({ name: ability, turn })
    })
    every.weapons.forEach(name => weaponRows.push({ name, turn: '' }))
    if (every.ability) abilityRows.push({ name: every.ability, turn: '' })

    const needed = Math.max(weaponRows.length + backups.weapons.length, abilityRows.length + backups.abilities.length)
    count = Math.min(Math.max(count, needed), maxRows)

    const fitBackups = (rows, extra, kind) => {
        if (rows.length > count) problems.push(`The plan needs ${rows.length} ${kind} rows but the Autofighter can only have ${count}.`)
        const skipped = []
        for (const name of extra) {
            if (rows.length < count) rows.push({ name, turn: '' })
            else skipped.push(name)
        }
        if (skipped.length) problems.push(`No room for these backup ${kind}s: ${skipped.join(', ')}.`)
    }
    fitBackups(weaponRows, backups.weapons, 'weapon')
    fitBackups(abilityRows, backups.abilities, 'ability')

    const preset = {
        abilities: padRows(abilityRows.slice(0, count).map(row => row.name), count, ''),
        abilityTurns: padRows(abilityRows.slice(0, count).map(row => row.turn), count, ''),
        weapons: padRows(weaponRows.slice(0, count).map(row => row.name), count, ''),
        weaponTurns: padRows(weaponRows.slice(0, count).map(row => row.turn), count, ''),
        weaponReloads: padRows(weaponRows.slice(0, count).map(row => !!reloads[row.name]), count, false),
    }
    return { preset, problems, rows: count }
}

function planFromPreset(preset, info) {
    const turnCount = Math.max(lastConfiguredTurn(preset), 1)
    const turns = simulate(preset, turnCount, info).map(step => ({
        weapons: step.weapons.map(slot => slot.name),
        ability: step.ability.name,
    }))
    const after = simulate(preset, turnCount + 1, info)[turnCount]
    return { turns, every: { weapons: after.weapons.map(slot => slot.name), ability: after.ability.name } }
}

function nameWarnings(preset) {
    const seen = {}
    const warnings = []
    preset.abilities.concat(preset.weapons).map(cleanName).filter(Boolean).forEach(name => {
        const key = name.toLowerCase().replace(/\s+/g, ' ').trim()
        const warning = `"${seen[key]}" and "${name}" look like the same item, but the Autofighter needs the exact name.`
        if (!seen[key]) seen[key] = name
        else if (seen[key] !== name && !warnings.includes(warning)) warnings.push(warning)
    })
    return warnings
}

const nameKey = name => (name || '').toLowerCase().replace(/[^a-z0-9]/g, '')

function editDistance(a, b) {
    let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
    for (let i = 1; i <= a.length; i++) {
        const current = [i]
        for (let j = 1; j <= b.length; j++) {
            current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
        }
        previous = current
    }
    return previous[b.length]
}

function closestName(name, names) {
    const key = nameKey(name)
    let best = ''
    let bestDistance = Math.max(2, Math.floor(key.length / 5)) + 1
    names.forEach(candidate => {
        const candidateKey = nameKey(candidate)
        if (Math.abs(candidateKey.length - key.length) >= bestDistance) return
        const distance = editDistance(key, candidateKey)
        if (distance < bestDistance) {
            best = candidate
            bestDistance = distance
        }
    })
    return best
}

function unknownNameWarnings(preset, known) {
    const warnings = []
    const check = (names, kind) => {
        names.map(cleanName).filter((name, index, all) => name && all.indexOf(name) === index).forEach(name => {
            if (known[kind].info(name)) return
            const suggestion = closestName(name, known[kind].names)
            const text = suggestion
                ? `"${name}" isn't a ${kind} the planner knows. Did you mean "${suggestion}"? The Autofighter needs the exact name, or it never uses it.`
                : `"${name}" isn't a ${kind} the planner knows. Check the spelling, the Autofighter needs the exact name.`
            warnings.push({ text, name, kind, suggestion })
        })
    }
    check(preset.weapons, 'weapon')
    check(preset.abilities, 'ability')
    return warnings
}

const escapeName = name => encodeURIComponent(name).replace(/[._~!'()*-]/g, char => '%' + char.charCodeAt(0).toString(16).toUpperCase())

function encodeItem(name, kind, catalog) {
    name = cleanName(name)
    if (!name) return ''
    const info = catalog[kind].info(name)
    return info && info.name === name ? info.id.toString(36) : '~' + escapeName(name)
}

function decodeItem(token, kind, catalog) {
    if (!token) return ''
    if (token[0] === '~') {
        try { return decodeURIComponent(token.slice(1)) } catch (e) { return '' }
    }
    const info = catalog[kind].byId(parseInt(token, 36))
    return info ? info.name : ''
}

function encodePlan(plan, reloads, catalog) {
    const step = item => [item.weapons[0], item.weapons[1]].map(name => encodeItem(name, 'weapon', catalog))
        .concat(encodeItem(item.ability, 'ability', catalog)).join('_')
    const text = 'plan=' + plan.turns.concat(plan.every).map(step).join('.')
    const reloading = Object.keys(reloads).filter(name => reloads[name]).map(name => encodeItem(name, 'weapon', catalog)).filter(Boolean)
    return reloading.length ? text + '&r=' + reloading.join('_') : text
}

function decodePlan(hash, catalog) {
    const parts = {}
    hash.replace(/^#/, '').split('&').forEach(part => {
        const at = part.indexOf('=')
        if (at > 0) parts[part.slice(0, at)] = part.slice(at + 1)
    })
    if (!parts.plan) return null
    const steps = parts.plan.split('.').map(text => {
        const [first, second, ability] = text.split('_')
        return { weapons: [decodeItem(first, 'weapon', catalog), decodeItem(second, 'weapon', catalog)], ability: decodeItem(ability, 'ability', catalog) }
    })
    const reloads = {}
    ;(parts.r || '').split('_').map(token => decodeItem(token, 'weapon', catalog)).filter(Boolean).forEach(name => reloads[name] = true)
    return { plan: { turns: steps.slice(0, -1), every: steps[steps.length - 1] }, reloads }
}

const planner = { encodePlan, decodePlan, goneAfterUse, presetIds, rowCount, presetLabel, readPreset, writePreset, simulate, lastConfiguredTurn, sameWeapons, buildPreset, planFromPreset, nameWarnings, closestName, unknownNameWarnings }
if (typeof module !== 'undefined') module.exports = planner
else window.planner = planner
