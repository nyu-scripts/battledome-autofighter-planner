(function() {
    'use strict'
    const { presetIds, presetLabel, writePreset, simulate, sameWeapons, buildPreset, nameWarnings, decodePlan } = window.planner

    const byId = id => document.getElementById(id)
    const weaponUsage = name => (window.weaponInfo(name) || {}).usage || ''
    const rules = { ability: window.abilityInfo, weaponUsage }
    const catalog = { weapon: { info: window.weaponInfo, byId: window.weaponById }, ability: { info: window.abilityInfo, byId: window.abilityById } }
    const cleanName = name => (name || '').trimEnd()
    // Without the visitor's settings, the Autofighter's default row count is all we know
    const defaultRows = 10

    function make(tag, text, className) {
        const node = document.createElement(tag)
        if (text !== undefined && text !== null) node.textContent = text
        if (className) node.className = className
        return node
    }

    const notice = (text, kind) => make('p', text, 'notice' + (kind ? ' ' + kind : ''))

    const shared = decodePlan(location.hash, catalog)
    if (!shared) {
        byId('missingSection').hidden = false
        return
    }
    byId('sharedSection').hidden = false
    byId('openPlanner').href = 'index.html' + location.hash + '&edit=1'

    const state = { presetId: 'Default', output: null, rows: defaultRows }
    const plan = shared.plan
    const steps = plan.turns.concat([plan.every])

    function slotPicture(kind, name) {
        const slot = make('span', null, 'slot ' + kind)
        const trimmed = cleanName(name)
        if (!trimmed) {
            slot.classList.add('empty')
            return slot
        }
        const info = kind === 'weapon' ? window.weaponInfo(trimmed) : window.abilityInfo(trimmed)
        if (info) {
            const picture = make('img', null, 'item-picture')
            picture.src = info.image
            picture.alt = ''
            slot.append(picture)
        } else slot.append(make('span', '?', 'unknown'))
        slot.title = trimmed
        return slot
    }

    function matches(step, wanted) {
        const weapons = wanted.weapons.map(cleanName)
        const picked = step.weapons.map(pick => pick.name)
        const weaponsOk = weapons.every(name => !name) || (weapons.every(Boolean) ? sameWeapons(picked, weapons) : picked.includes(weapons.find(Boolean)))
        const ability = cleanName(wanted.ability)
        return weaponsOk && (!ability || step.ability.name === ability)
    }

    function renderRounds(results) {
        byId('sharedRounds').replaceChildren(...steps.map((step, index) => {
            const last = index === steps.length - 1
            const panel = make('div', null, 'plan-panel' + (last ? ' final' : ''))
            panel.append(make('span', last ? `Round ${index + 1}+` : `Round ${index + 1}!`, 'burst'))
            if (!results[index]) {
                const stamp = make('span', 'Oops!', 'stamp bad')
                stamp.title = "The Autofighter can't do this round exactly as written"
                panel.append(stamp)
            }
            const slots = make('div', null, 'plan-slots')
            const field = (kind, name) => {
                const wrap = make('div', null, 'plan-field')
                wrap.append(slotPicture(kind, name), make('span', cleanName(name) || (kind === 'weapon' ? 'Any weapon' : 'Any ability'), 'plan-name' + (cleanName(name) ? '' : ' empty')))
                slots.append(wrap)
            }
            field('weapon', step.weapons[0])
            field('weapon', step.weapons[1])
            field('ability', step.ability)
            panel.append(slots)
            if (last) panel.append(make('div', 'Repeats until the fight ends.', 'plan-say'))
            return panel
        }))
    }

    function build() {
        const { preset, problems, rows } = buildPreset(plan, defaultRows, { weapons: [], abilities: [] }, shared.reloads)
        state.output = preset
        state.rows = rows
        const simulated = simulate(preset, steps.length, rules)
        const results = simulated.map((step, index) => matches(step, steps[index]))
        renderRounds(results)

        const messages = problems.map(text => notice(text, 'bad'))
        if (results.some(ok => !ok)) messages.push(notice("Some rounds (stamped Oops!) can't be done exactly as written, the Autofighter uses something else there.", 'bad'))
        messages.push(...nameWarnings(preset).map(text => notice(text)))
        if (rows > defaultRows) messages.push(notice(`This plan needs ${rows} rows, so the file also sets the Autofighter to ${rows} rows.`))
        byId('sharedProblems').replaceChildren(...messages)

        const blocked = problems.length > 0
        byId('download').disabled = blocked
        byId('copyJson').disabled = blocked
        state.mismatch = results.some(ok => !ok)
    }

    function renderPresetPicker() {
        byId('presetPicker').replaceChildren(...presetIds.map(id => {
            const button = make('button', null, 'preset-chip')
            button.type = 'button'
            button.setAttribute('role', 'radio')
            const on = id === state.presetId
            button.classList.toggle('active', on)
            button.setAttribute('aria-checked', on ? 'true' : 'false')
            button.append(make('span', presetLabel({}, id)))
            button.addEventListener('click', () => {
                state.presetId = id
                renderPresetPicker()
            })
            return button
        }))
    }

    // Only this preset's rows go in the file; the Autofighter's Upload merges it over the saved settings
    function outputJson() {
        const output = writePreset({}, state.presetId, state.output)
        if (state.rows > defaultRows) output.maxAWLines = state.rows
        return JSON.stringify(output)
    }

    const confirmMismatch = () => !state.mismatch || window.confirm("Some rounds (stamped Oops!) won't go the way they're written. Save these settings anyway?")

    byId('download').addEventListener('click', () => {
        if (!confirmMismatch()) return
        const link = make('a')
        link.href = URL.createObjectURL(new Blob([outputJson()], { type: 'application/json' }))
        link.download = `battledome.settings.shared-${presetLabel({}, state.presetId).replace(/[^a-z0-9]+/gi, '-')}.json`
        link.click()
        const info = byId('downloadInfo')
        info.textContent = `Saved as ${link.download}. That's the file to pick with Upload.`
        info.hidden = false
        const button = byId('download')
        button.classList.add('saved')
        setTimeout(() => button.classList.remove('saved'), 1800)
        setTimeout(() => URL.revokeObjectURL(link.href), 1000)
    })

    byId('copyJson').addEventListener('click', async () => {
        const button = byId('copyJson')
        if (!confirmMismatch()) return
        try {
            await navigator.clipboard.writeText(outputJson())
            button.textContent = 'Copied!'
        } catch (e) {
            button.textContent = "Couldn't copy, use Download"
        }
        setTimeout(() => button.textContent = 'Copy as text', 1500)
    })

    renderPresetPicker()
    build()
})()
