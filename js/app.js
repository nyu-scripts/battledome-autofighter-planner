(function() {
    'use strict'
    const { presetIds, rowCount, presetLabel, readPreset, writePreset, simulate, lastConfiguredTurn, sameWeapons, buildPreset, planFromPreset, nameWarnings, unknownNameWarnings, encodePlan, decodePlan } = window.planner

    const weaponUsage = name => (window.weaponInfo(name) || {}).usage || ''
    const rules = { ability: window.abilityInfo, weaponUsage }
    const state = { settings: null, presetId: 'Default', plan: null, reloads: {}, output: null, statusCells: [], planFields: [] }
    const byId = id => document.getElementById(id)
    const catalog = { weapon: { info: window.weaponInfo, byId: window.weaponById }, ability: { info: window.abilityInfo, byId: window.abilityById } }
    const unique = names => names.map(name => (name || '').trimEnd()).filter((name, index, all) => name && all.indexOf(name) === index)

    function make(tag, text, className) {
        const node = document.createElement(tag)
        if (text !== undefined && text !== null) node.textContent = text
        if (className) node.className = className
        return node
    }

    function table(headers, rows) {
        const result = make('table')
        const head = make('tr')
        headers.forEach(header => head.append(make('th', header)))
        result.append(head)
        rows.forEach(row => result.append(row))
        return result
    }

    function notice(text, kind) {
        return make('p', text, 'notice' + (kind ? ' ' + kind : ''))
    }

    function showLoadError(text) {
        const error = byId('loadError')
        error.textContent = text
        error.hidden = !text
    }

    function loadSettings(text) {
        showLoadError('')
        let settings
        try {
            settings = JSON.parse(text)
        } catch (e) {
            showLoadError("That doesn't look like an Autofighter settings file. Make sure it's the battledome.settings.json you downloaded.")
            return
        }
        const known = settings && typeof settings === 'object' && presetIds.some(id => Array.isArray(settings[id + 'Weapons']) || Array.isArray(settings[id + 'Abilities']))
        if (!known) {
            showLoadError("That file has no Autofighter presets in it. Make sure it's the battledome.settings.json you downloaded.")
            return
        }
        state.settings = settings
        renderPresetPicker()
        byId('dropZone').classList.add('loaded')
        byId('dropZone').querySelector('b').textContent = 'Settings loaded ✓'
        byId('dropZone').querySelector('span').textContent = 'drop or click to load another file'
        choosePreset(presetIds.includes(settings.SelectedPreset) ? settings.SelectedPreset : 'Default')
        document.querySelectorAll('#stepNav button').forEach(button => button.disabled = false)
        showStep(2)
    }

    function showStep(step) {
        document.querySelectorAll('main > section[data-step]').forEach(section => section.hidden = section.dataset.step !== String(step))
        document.querySelectorAll('#stepNav button').forEach(button => {
            const current = button.dataset.step === String(step)
            button.classList.toggle('active', current)
            button.classList.toggle('done', !button.disabled && Number(button.dataset.step) < Number(step))
            if (current) button.setAttribute('aria-current', 'step')
            else button.removeAttribute('aria-current')
        })
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    document.querySelectorAll('#stepNav button').forEach(button => button.addEventListener('click', () => showStep(button.dataset.step)))
    document.querySelectorAll('[data-go]').forEach(button => button.addEventListener('click', () => showStep(button.dataset.go)))
    showStep(1)

    function readFile(file) {
        if (!file) return
        const reader = new FileReader()
        reader.onload = () => loadSettings(reader.result)
        reader.readAsText(file)
    }

    byId('settingsFile').addEventListener('change', event => {
        readFile(event.target.files[0])
        event.target.value = ''
    })
    const dropZone = byId('dropZone')
    dropZone.addEventListener('dragover', event => { event.preventDefault(); dropZone.classList.add('over') })
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('over'))
    dropZone.addEventListener('drop', event => {
        event.preventDefault()
        dropZone.classList.remove('over')
        readFile(event.dataTransfer.files[0])
    })
    byId('pasteLoad').addEventListener('click', () => loadSettings(byId('settingsText').value))

    function itemPicture(info) {
        const picture = make('img', null, 'item-picture')
        picture.src = info.image
        picture.alt = ''
        picture.loading = 'lazy'
        return picture
    }

    function usageLabel(info) {
        if (!info) return ''
        if (info.limit === 'battle') return 'once per battle'
        if (info.limit === 'day') return 'once per day'
        if (info.cooldown) return `cooldown ${info.cooldown}`
        return ''
    }

    // Fragile weapons break at random, so the planner can only warn about them
    const weaponLabels = {
        'Once per Battle': 'once per battle',
        'Single Use': 'single use',
        'Fragile Once Per Battle': 'once per battle, may break',
        'Fragile': 'may break',
        'Semi-Fragile': 'may break',
    }
    const weaponLabel = usage => weaponLabels[usage] || ''

    const lookup = kind => kind === 'weapon' ? window.weaponInfo : window.abilityInfo
    const pictureTitle = (kind, info) => info ? [info.name, kind === 'weapon' ? weaponLabel(info.usage) : usageLabel(info)].filter(Boolean).join(', ') : ''

    function describe(pick, turnValues, kind) {
        const cell = make('td', null, 'pick-cell')
        const slot = make('span', null, 'item-slot arena ' + kind)
        cell.append(slot)
        if (!pick.name) {
            cell.append(make('span', 'nothing', 'empty'))
            return cell
        }
        const known = lookup(kind)(pick.name)
        if (known) slot.append(itemPicture(known))
        slot.title = pictureTitle(kind, known) || pick.name
        cell.append(make('span', pick.name, 'pick-name'))

        const turn = turnValues[pick.row]
        const marks = {
            reserved: [`🔒 ${turn}`, `Row ${pick.row + 1}, locked to turn ${turn}`],
            filler: ['any turn', `Row ${pick.row + 1}, no turn set, used on any turn`],
            borrowed: [turn, `Row ${pick.row + 1} is set for turn ${turn}, used here because nothing else was left`],
        }
        const [text, title] = marks[pick.how]
        const mark = make('span', text, 'turn-mark ' + pick.how)
        mark.title = title
        const tags = make('span', null, 'pick-tags')
        tags.append(mark)
        if (pick.reload) tags.append(make('span', 'reloads', 'tag reload'))
        const limit = kind === 'weapon' ? weaponLabel(pick.usage) : usageLabel(pick.rules)
        if (limit) tags.append(make('span', limit, 'tag limit'))
        cell.append(tags)
        return cell
    }

    function simulationTable(preset, turnCount, expected) {
        const rows = simulate(preset, turnCount, rules).map(step => {
            const row = make('tr')
            if (expected) row.className = matches(step, expected(step.turn)) ? 'ok' : 'bad'
            row.append(make('td', String(step.turn), 'turn'))
            step.weapons.forEach(pick => row.append(describe(pick, preset.weaponTurns, 'weapon')))
            row.append(describe(step.ability, preset.abilityTurns, 'ability'))
            return row
        })
        return table(['Turn', 'Weapon', 'Weapon', 'Ability'], rows)
    }

    function choosePreset(id) {
        state.presetId = id
        markPreset(id)
        const preset = readPreset(state.settings, id)
        state.reloads = {}
        preset.weapons.forEach((name, index) => { if (name && preset.weaponReloads[index]) state.reloads[name.trimEnd()] = true })

        renderCurrent(preset)

        state.plan = state.shared ? JSON.parse(JSON.stringify(state.shared.plan)) : planFromPreset(preset, rules)
        if (state.shared) Object.assign(state.reloads, state.shared.reloads)
        renderSharedPlanNotice()
        renderPlan()
        state.startOutput = state.shared ? null : JSON.stringify(state.output)
        state.savedOutput = null
    }

    function hasUnsavedChanges() {
        if (!state.output) return false
        const output = JSON.stringify(state.output)
        return output !== state.startOutput && output !== state.savedOutput
    }
    const markSaved = () => { state.savedOutput = JSON.stringify(state.output) }

    window.addEventListener('beforeunload', event => {
        if (!hasUnsavedChanges()) return
        event.preventDefault()
        event.returnValue = ''
    })


    function renderSharedPlanNotice() {
        if (!state.shared) return byId('sharedPlanNotice').replaceChildren()
        const box = notice('Using the plan from the shared link. Your other weapons and abilities still stay as spares if you keep that ticked.', 'good')
        box.classList.add('fixable')
        const own = make('button', "Use this preset's own plan", 'button secondary fix')
        own.type = 'button'
        own.addEventListener('click', () => {
            state.shared = null
            history.replaceState(null, '', location.pathname + location.search)
            choosePreset(state.presetId)
        })
        box.append(own)
        byId('sharedPlanNotice').replaceChildren(box)
    }

    state.shared = decodePlan(location.hash, catalog)
    if (state.shared) {
        const turns = state.shared.plan.turns.length
        byId('sharedNotice').replaceChildren(notice(`🔗 Someone shared a plan with you (${turns} turn${turns === 1 ? '' : 's'}, then what to use after). Load your settings above and it goes into the preset you pick.`, 'good'))
    }

    byId('shareLink').addEventListener('click', async () => {
        const button = byId('shareLink')
        const link = location.href.split('#')[0] + '#' + encodePlan(state.plan, state.reloads, catalog)
        const info = byId('shareInfo')
        info.hidden = false
        try {
            await navigator.clipboard.writeText(link)
            button.textContent = 'Link copied!'
            info.textContent = 'Only the plan goes in the link, nothing else from your settings. Whoever opens it loads their own settings file to use it.'
        } catch (e) {
            info.textContent = "Couldn't copy it, here's the link: " + link
        }
        setTimeout(() => button.textContent = '🔗 Copy share link', 1500)
    })

    function renderCurrent(preset) {
        const known = { weapon: { info: window.weaponInfo, names: window.weaponNames }, ability: { info: window.abilityInfo, names: window.abilityNames } }
        const unknown = unknownNameWarnings(preset, known).map(warning => {
            const box = notice(warning.text)
            if (warning.suggestion) {
                const fix = make('button', `Use "${warning.suggestion}"`, 'button fix')
                fix.type = 'button'
                fix.addEventListener('click', () => fixName(warning.kind, warning.name, warning.suggestion))
                box.classList.add('fixable')
                box.append(fix)
            }
            return box
        })
        byId('currentWarnings').replaceChildren(...unknown, ...nameWarnings(preset).map(text => notice(text)))
    }

    function fixName(kind, wrong, right) {
        const swap = name => (name || '').trimEnd() === wrong ? right : name
        const key = state.presetId + (kind === 'weapon' ? 'Weapons' : 'Abilities')
        state.settings[key] = (state.settings[key] || []).map(swap)
        if (state.reloads[wrong]) {
            state.reloads[right] = true
            delete state.reloads[wrong]
        }
        state.plan.turns.concat(state.plan.every).forEach(step => {
            if (kind === 'weapon') step.weapons = step.weapons.map(swap)
            else step.ability = swap(step.ability)
        })
        renderCurrent(readPreset(state.settings, state.presetId))
        renderPlan()
    }

    function renderPresetPicker() {
        const count = (names, one, many) => {
            const total = unique(names).length
            return `${total} ${total === 1 ? one : many}`
        }
        byId('presetPicker').replaceChildren(...presetIds.map(id => {
            const preset = readPreset(state.settings, id)
            const button = make('button', null, 'preset-chip')
            button.type = 'button'
            button.dataset.preset = id
            button.setAttribute('role', 'radio')
            const label = make('span')
            label.append(presetLabel(state.settings, id), make('small', `${count(preset.weapons, 'weapon', 'weapons')} · ${count(preset.abilities, 'ability', 'abilities')}`))
            button.append(label)
            button.addEventListener('click', () => {
                if (id === state.presetId) return
                if (hasUnsavedChanges() && !window.confirm("Your changes to this preset haven't been downloaded yet. Switch presets and lose them?")) return
                choosePreset(id)
            })
            return button
        }))
    }

    function markPreset(id) {
        document.querySelectorAll('#presetPicker .preset-chip').forEach(button => {
            const on = button.dataset.preset === id
            button.classList.toggle('active', on)
            button.setAttribute('aria-checked', on ? 'true' : 'false')
        })
    }

    const allNames = kind => kind === 'weapon' ? window.weaponNames : window.abilityNames
    const searchKey = name => (name || '').toLowerCase().replace(/[^a-z0-9]/g, '')
    const emptyLabel = kind => kind === 'weapon' ? 'Any weapon' : 'Any ability'

    function slotPicture(kind, name, tag) {
        const slot = make(tag || 'span', null, 'slot ' + kind)
        const trimmed = (name || '').trimEnd()
        if (!trimmed) {
            slot.classList.add('empty')
            return slot
        }
        const info = lookup(kind)(trimmed)
        if (info) slot.append(itemPicture(info))
        else slot.append(make('span', '?', 'unknown'))
        slot.title = pictureTitle(kind, info) || trimmed
        return slot
    }

    function nowStrip(step, preset) {
        const strip = make('div', null, 'now-strip')
        const how = (pick, turns) => {
            if (!pick.name) return ''
            const turn = turns[pick.row]
            return {
                reserved: `row ${pick.row + 1}, locked to turn ${turn}`,
                filler: `row ${pick.row + 1}, used on any turn`,
                borrowed: `row ${pick.row + 1} is set for turn ${turn}, used here because nothing else was left`,
            }[pick.how]
        }
        const add = (kind, pick, turns) => {
            const slot = slotPicture(kind, pick.name)
            slot.title = pick.name ? `${slot.title} (${how(pick, turns)})` : 'Nothing'
            strip.append(slot)
        }
        step.weapons.forEach(pick => add('weapon', pick, preset.weaponTurns))
        add('ability', step.ability, preset.abilityTurns)
        return strip
    }

    function usedEarlier(kind, name, index) {
        const info = lookup(kind)(name)
        if (!info) return 0
        const gone = kind === 'weapon' ? window.planner.goneAfterUse.includes(info.usage) : !!info.limit
        if (!gone) return 0
        const earlier = state.plan.turns.slice(0, index).findIndex(step => kind === 'weapon' ? step.weapons.some(other => (other || '').trimEnd() === info.name) : (step.ability || '').trimEnd() === info.name)
        return earlier + 1
    }

    const picker = { node: null, anchor: null }

    function closePicker() {
        if (!picker.node) return
        picker.node.remove()
        picker.anchor.classList.remove('editing')
        picker.node = null
        picker.anchor = null
    }

    document.addEventListener('mousedown', event => {
        if (picker.node && !picker.node.contains(event.target) && !picker.anchor.contains(event.target)) closePicker()
    })
    document.addEventListener('keydown', event => { if (event.key === 'Escape') closePicker() })

    function openPicker(kind, step, slot, index, anchor, panel, title) {
        const reopening = picker.anchor === anchor
        closePicker()
        if (reopening) return
        const current = (kind === 'weapon' ? step.weapons[slot] : step.ability || '').trimEnd()
        const preset = readPreset(state.settings, state.presetId)
        const box = make('div', null, 'picker')
        box.setAttribute('role', 'dialog')
        box.setAttribute('aria-label', title)

        const head = make('div', null, 'picker-head')
        const close = make('button', '×', 'picker-close')
        close.type = 'button'
        close.setAttribute('aria-label', 'Close')
        close.addEventListener('click', closePicker)
        head.append(make('span', title), close)

        const search = make('input')
        search.type = 'text'
        search.placeholder = kind === 'weapon' ? 'Search any weapon...' : 'Search abilities...'
        search.setAttribute('aria-label', search.placeholder)
        const results = make('div', null, 'picker-results')
        box.append(head, search, results)

        const choose = name => {
            if (kind === 'weapon') step.weapons[slot] = name
            else step.ability = name
            closePicker()
            renderPlan()
        }

        const grid = names => {
            const node = make('div', null, 'picker-grid')
            names.forEach(name => {
                const button = slotPicture(kind, name, 'button')
                button.type = 'button'
                if (name === current) button.classList.add('picked')
                const earlier = usedEarlier(kind, name, index)
                if (earlier) {
                    button.append(make('span', `used R${earlier}`, 'tag'))
                    button.title += `, already used in round ${earlier}`
                }
                button.addEventListener('click', () => choose(name))
                node.append(button)
            })
            return node
        }

        let found = []
        const show = () => {
            const words = search.value.split(/\s+/).map(searchKey).filter(Boolean)
            const query = words.join('')
            const own = unique(kind === 'weapon' ? preset.weapons : preset.abilities)
            const parts = []
            if (!query) {
                if (own.length) parts.push(make('div', 'In this preset', 'picker-label'), grid(own))
                if (kind === 'ability') parts.push(make('div', 'All abilities', 'picker-label'), grid(allNames(kind).slice().sort((a, b) => a.localeCompare(b))))
                else parts.push(make('p', 'Type to find any other weapon.', 'picker-note'))
                found = []
            } else {
                found = unique(own.concat(allNames(kind))).filter(name => words.every(word => searchKey(name).includes(word))).slice(0, 30)
                if (found.length) parts.push(grid(found))
                parts.push(make('p', found.length ? 'Enter picks the first one.' : `Nothing called that. Press Enter to use "${search.value.trim()}" anyway.`, 'picker-note'))
            }
            const clear = make('button', `Leave empty (${emptyLabel(kind).toLowerCase()})`, 'picker-clear')
            clear.type = 'button'
            clear.addEventListener('click', () => choose(''))
            parts.push(clear)
            results.replaceChildren(...parts)
        }
        search.addEventListener('input', show)
        search.addEventListener('keydown', event => {
            if (event.key !== 'Enter' || !search.value.trim()) return
            event.preventDefault()
            choose(found[0] || search.value.trim())
        })
        show()

        panel.append(box)
        const left = Math.max(0, Math.min(anchor.offsetLeft + anchor.offsetWidth / 2 - 30, panel.clientWidth - box.offsetWidth))
        box.style.left = left + 'px'
        box.style.setProperty('--arrow', (anchor.offsetLeft + anchor.offsetWidth / 2 - left - 8) + 'px')
        anchor.classList.add('editing')
        picker.node = box
        picker.anchor = anchor
        search.focus()
    }

    function planPanel(step, index, last) {
        const round = index + 1
        const panel = make('div', null, 'plan-panel' + (last ? ' final' : ''))
        panel.append(make('span', last ? `Round ${round}+` : `Round ${round}!`, 'burst'))
        const stamp = make('span', null, 'stamp')
        panel.append(stamp)
        if (!last) {
            const remove = make('button', '×', 'panel-remove')
            remove.type = 'button'
            remove.title = `Remove round ${round}`
            remove.addEventListener('click', () => {
                state.plan.turns.splice(index, 1)
                renderPlan()
            })
            panel.append(remove)
        }
        const slots = make('div', null, 'plan-slots')
        const fields = []
        const field = (kind, name, slot, title) => {
            const wrap = make('div', null, 'plan-field')
            const button = slotPicture(kind, name, 'button')
            button.type = 'button'
            button.setAttribute('aria-label', `${title}: ${(name || '').trimEnd() || emptyLabel(kind)}`)
            button.addEventListener('click', () => openPicker(kind, step, slot, index, button, panel, title))
            wrap.append(button, make('span', (name || '').trimEnd() || emptyLabel(kind), 'plan-name' + ((name || '').trim() ? '' : ' empty')))
            fields.push(wrap)
            slots.append(wrap)
        }
        const label = last ? `round ${round} and later` : `round ${round}`
        field('weapon', step.weapons[0], 0, `Weapon 1, ${label}`)
        field('weapon', step.weapons[1], 1, `Weapon 2, ${label}`)
        field('ability', step.ability, 0, `Ability, ${label}`)
        const say = make('div', null, 'plan-say')
        panel.append(slots, say)
        state.planFields.push(fields)
        state.statusCells.push({ stamp, say, last })
        return panel
    }

    function renderPlan() {
        closePicker()
        state.statusCells = []
        state.planFields = []
        const current = readPreset(state.settings, state.presetId)
        const steps = state.plan.turns.concat([state.plan.every])
        state.nowSteps = simulate(current, steps.length, rules)
        const strips = make('div', null, 'strips')
        const planHead = make('div', 'Your plan', 'strip-head plan')
        strips.append(make('div', 'Right now', 'strip-head now'), make('div'), planHead)
        steps.forEach((step, index) => {
            strips.append(nowStrip(state.nowSteps[index], current), make('div', '►', 'strip-arrow'), planPanel(step, index, index === steps.length - 1))
        })
        const add = make('button', '+ Round', 'plan-panel add')
        add.type = 'button'
        add.title = 'Add a round, starting as a copy of the one before'
        add.addEventListener('click', () => {
            const before = state.plan.turns[state.plan.turns.length - 1] || state.plan.every
            state.plan.turns.push({ weapons: before.weapons.slice(), ability: before.ability })
            renderPlan()
        })
        strips.append(make('div'), make('div'), add)
        byId('planStrips').replaceChildren(strips)
        renderResult()
    }

    byId('resetPlan').addEventListener('click', () => choosePreset(state.presetId))
    byId('keepBackups').addEventListener('change', renderResult)

    function matches(step, wanted) {
        const weapons = wanted.weapons.map(name => (name || '').trimEnd())
        const picked = step.weapons.map(pick => pick.name)
        const weaponsOk = weapons.every(name => !name) || (weapons.every(Boolean) ? sameWeapons(picked, weapons) : picked.includes(weapons.find(Boolean)))
        const ability = (wanted.ability || '').trimEnd()
        return weaponsOk && (!ability || step.ability.name === ability)
    }

    function abilityExplanations(steps, expected) {
        const explanations = []
        steps.forEach(step => {
            const wanted = (expected(step.turn).ability || '').trimEnd()
            if (!wanted || step.ability.name === wanted) return
            const info = window.abilityInfo(wanted)
            if (!info) return
            const earlier = steps.filter(other => other.turn < step.turn && other.ability.name === info.name).map(other => other.turn)
            if (!earlier.length) return
            const instead = step.ability.name ? `, so it uses ${step.ability.name} instead` : ''
            if (info.limit) {
                explanations.push(`Turn ${step.turn}: ${info.name} is ${usageLabel(info)} and was already used on turn ${earlier[0]}${instead}.`)
            } else if (info.cooldown) {
                explanations.push(`Turn ${step.turn}: ${info.name} needs ${info.cooldown} turn${info.cooldown > 1 ? 's' : ''} to cool down after turn ${earlier[earlier.length - 1]}${instead}.`)
            }
        })
        return explanations
    }

    function weaponExplanations(steps, expected) {
        const explanations = []
        steps.forEach(step => {
            const picked = step.weapons.map(pick => pick.name)
            expected(step.turn).weapons.map(name => (name || '').trimEnd()).filter(name => name && !picked.includes(name)).forEach(wanted => {
                const info = window.weaponInfo(wanted)
                if (!info || !window.planner.goneAfterUse.includes(info.usage)) return
                const earlier = steps.filter(other => other.turn < step.turn && other.weapons.some(pick => pick.name === wanted)).map(other => other.turn)
                if (!earlier.length) return
                explanations.push(`Turn ${step.turn}: ${wanted} is ${weaponLabel(info.usage)} and was already used on turn ${earlier[0]}. To use it again, your pet needs a second one equipped, and the preset needs it written twice.`)
            })
        })
        return explanations
    }

    function fieldMisses(step, wanted) {
        const left = step.weapons.map(pick => pick.name)
        const weapons = wanted.weapons.map(name => (name || '').trimEnd())
        const missed = weapons.map(name => {
            if (!name) return false
            const found = left.indexOf(name)
            if (found === -1) return true
            left.splice(found, 1)
            return false
        })
        const instead = left.filter(Boolean)
        const misses = missed.map(miss => miss ? (instead.shift() || 'nothing') : null)
        const ability = (wanted.ability || '').trimEnd()
        misses.push(ability && step.ability.name !== ability ? (step.ability.name || 'nothing') : null)
        return misses
    }

    function backupNames(preset) {
        const used = unique(state.plan.turns.concat(state.plan.every).flatMap(step => step.weapons.concat(step.ability)))
        const spare = names => unique(names).filter(name => !used.includes(name))
        return { weapons: spare(preset.weapons), abilities: spare(preset.abilities) }
    }

    function renderResult() {
        const current = readPreset(state.settings, state.presetId)
        const backups = byId('keepBackups').checked ? backupNames(current) : { weapons: [], abilities: [] }
        const { preset, problems, rows } = buildPreset(state.plan, rowCount(state.settings), backups, state.reloads)
        state.output = preset
        state.outputRows = rows

        const expected = turn => state.plan.turns[turn - 1] || state.plan.every
        const turnCount = state.plan.turns.length + 1
        const steps = simulate(preset, turnCount, rules)
        const explanations = weaponExplanations(steps, expected).concat(abilityExplanations(steps, expected))
        steps.forEach((step, index) => {
            const wanted = expected(step.turn)
            const ok = matches(step, wanted)
            const status = state.statusCells[index]
            const same = matches(state.nowSteps[index], wanted)
            status.stamp.textContent = !ok ? 'Oops!' : same ? 'Same' : 'Changed'
            status.stamp.className = 'stamp ' + (!ok ? 'bad' : same ? 'same' : 'changed')
            status.stamp.title = !ok ? "The Autofighter can't do this round exactly as written" : same ? 'The preset already does this' : 'Different from what the preset does now'
            const names = wanted.weapons.concat(wanted.ability).map(name => (name || '').trimEnd())
            const why = []
            fieldMisses(step, wanted).forEach((instead, slot) => {
                const field = state.planFields[index][slot]
                field.classList.toggle('problem', instead !== null)
                field.title = instead !== null ? `The Autofighter uses ${instead} here instead` : ''
                if (instead !== null) why.push(`Uses ${instead} instead of ${names[slot]}.`)
            })
            const prefix = `Turn ${step.turn}: `
            const reasons = explanations.filter(text => text.startsWith(prefix)).map(text => text.slice(prefix.length))
            status.say.textContent = !ok ? (reasons.length ? reasons : why).join(' ') : status.last ? 'Repeats until the fight ends.' : ''
            status.say.classList.toggle('bad', !ok)
        })
        const allGood = steps.every(step => matches(step, expected(step.turn)))

        const messages = problems.map(text => notice(text, 'bad'))
        if (!problems.length) {
            messages.push(allGood
                ? notice('✓ All set, the new preset does exactly what you wrote.', 'good')
                : notice("✗ Some rounds (stamped Oops! in your plan) can't be done exactly as written." + (explanations.length ? '' : " Check the names, or that you're not asking for an item twice without having two."), 'bad'))
        }
        messages.push(...explanations.map(text => notice(text, 'bad')))
        messages.push(...nameWarnings(preset).map(text => notice(text)))
        if (rows > rowCount(state.settings)) messages.push(notice(`The new settings give the Autofighter ${rows} rows instead of ${rowCount(state.settings)}, so everything fits. Every preset gets the extra rows, empty.`))
        const reloading = unique(preset.weapons.filter((name, index) => preset.weaponReloads[index]))
        if (reloading.length) messages.push(notice(`Reload is on for ${reloading.join(', ')}. Untick it in "Show the rows" below unless that weapon changes form after use.`))
        byId('resultProblems').replaceChildren(...messages)

        state.mismatch = !allGood
        const blocked = problems.length > 0
        byId('download').disabled = blocked
        byId('copyJson').disabled = blocked
        byId('download').title = blocked ? 'Fix the problems above first' : ''
        byId('copyJson').title = blocked ? 'Fix the problems above first' : ''

        byId('resultRows').replaceChildren(autofighterPanel(preset))
        byId('resultTable').replaceChildren(simulationTable(preset, turnCount + 1, expected))
    }

    function autofighterPanel(preset) {
        const column = (title, extraHeader) => {
            const node = make('div', null, 'af-column')
            const header = make('div', null, 'af-header')
            header.append(make('span', title))
            if (extraHeader) header.append(extraHeader)
            node.append(header)
            return node
        }
        const box = (value, placeholder, className) => {
            const input = make('input', null, className)
            input.type = 'text'
            input.readOnly = true
            input.value = value || ''
            input.placeholder = placeholder
            input.setAttribute('aria-label', placeholder)
            return input
        }
        const reloadMark = make('span', '↻')
        reloadMark.title = 'Reload the page once the turn this weapon was used in is over'

        const abilities = column('Abilities')
        const abilityTurns = column('Turn')
        const weapons = column('Weapons')
        const weaponTurns = column('Turn', reloadMark)
        preset.weapons.forEach((weapon, index) => {
            const number = String(index + 1)
            const abilityRow = make('div', null, 'af-row')
            abilityRow.append(make('span', number, 'af-index'), box(preset.abilities[index], 'Ability ' + number))
            abilities.append(abilityRow)
            abilityTurns.append(box(preset.abilityTurns[index], '', 'af-turn'))

            const weaponRow = make('div', null, 'af-row')
            weaponRow.append(make('span', number, 'af-index'), box(weapon, 'Weapon ' + number))
            weapons.append(weaponRow)
            const turnRow = make('div', null, 'af-row')
            const reload = make('input')
            reload.type = 'checkbox'
            reload.checked = !!preset.weaponReloads[index]
            reload.disabled = !weapon
            reload.setAttribute('aria-label', `Reload after weapon ${number}`)
            reload.addEventListener('change', () => { state.reloads[weapon.trimEnd()] = reload.checked; renderResult() })
            turnRow.append(box(preset.weaponTurns[index], '', 'af-turn'), reload)
            weaponTurns.append(turnRow)
        })
        const panel = make('div', null, 'af-panel')
        panel.append(abilities, abilityTurns, weapons, weaponTurns)
        return panel
    }

    function outputJson() {
        return JSON.stringify({ ...writePreset(state.settings, state.presetId, state.output), maxAWLines: state.outputRows })
    }

    const confirmMismatch = () => !state.mismatch || window.confirm("Some rounds (stamped Oops! in your plan) won't go the way you wrote them. Save these settings anyway?")

    function downloadName() {
        let number = 1
        try {
            number = (parseInt(localStorage.getItem('downloadCount')) || 0) + 1
            localStorage.setItem('downloadCount', String(number))
        } catch (e) {
            number = Date.now() % 100000
        }
        const preset = presetLabel(state.settings, state.presetId).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || state.presetId
        return `battledome.settings.${preset}-${number}.json`
    }

    byId('download').addEventListener('click', () => {
        if (!confirmMismatch()) return
        const link = make('a')
        link.href = URL.createObjectURL(new Blob([outputJson()], { type: 'application/json' }))
        link.download = downloadName()
        link.click()
        markSaved()
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
            markSaved()
            button.textContent = 'Copied!'
        } catch (e) {
            button.textContent = "Couldn't copy, use Download"
        }
        setTimeout(() => button.textContent = 'Copy as text', 1500)
    })
})()
