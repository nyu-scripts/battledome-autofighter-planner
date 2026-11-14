// Turns data/weapons.json into js/weapons.js (only weapons marked valid), so the page works from file:// too
const fs = require('fs')
const path = require('path')

const base = 'https://images.neopets.com/items/'
const sourcePath = path.join(__dirname, '../data/weapons.json')
const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'))

// Every weapon keeps a fixed number, used in share links. New weapons get the next free one;
// a number is never reused or changed, or old links would point at a different weapon.
let nextId = Math.max(0, ...Object.values(source).map(weapon => weapon.id || 0)) + 1
let added = 0
Object.values(source).forEach(weapon => {
    if (!weapon.id) { weapon.id = nextId++; added++ }
})
if (added) {
    fs.writeFileSync(sourcePath, JSON.stringify(source, null, 4) + '\n')
    console.log(`${added} new weapons numbered in data/weapons.json`)
}

const rows = Object.entries(source)
    .filter(([name, weapon]) => weapon.valid && weapon.img.startsWith(base))
    .map(([name, weapon]) => [name, weapon.img.slice(base.length), weapon.freq, weapon.id])

// Pictures saved in img/weapons/ are used from there; every other weapon loads its picture from Neopets
const savedDir = path.join(__dirname, '../img/weapons')
const saved = fs.existsSync(savedDir) ? fs.readdirSync(savedDir).filter(file => rows.some(row => row[1] === file)).sort() : []

const lines = rows.map(row => '    ' + JSON.stringify(row) + ',').join('\n')
const output = `
const weaponImageBase = '${base}'
const savedWeaponPictures = ${JSON.stringify(saved)}
const weaponPicture = file => (savedWeaponPictures.includes(file) ? 'img/weapons/' : weaponImageBase) + file

const weaponList = [
${lines}
]

// Look up by name, ignoring case, spaces and punctuation ("Thyora's Tear" finds "Thyoras Tear")
const weaponKey = name => (name || '').toLowerCase().replace(/[^a-z0-9]/g, '')
const weaponIndex = {}
const weaponIds = {}
weaponList.forEach(([name, image, usage, id]) => {
    weaponIndex[weaponKey(name)] = weaponIds[id] = { name, image: weaponPicture(image), usage, id }
})

function weaponInfo(name) {
    return weaponIndex[weaponKey(name)] || null
}

function weaponById(id) {
    return weaponIds[id] || null
}

const weaponNames = weaponList.map(([name]) => name)

if (typeof module !== 'undefined') module.exports = { weaponInfo, weaponById, weaponNames }
else {
    window.weaponInfo = weaponInfo
    window.weaponById = weaponById
    window.weaponNames = weaponNames
}
`
fs.writeFileSync(path.join(__dirname, '../js/weapons.js'), output)
console.log(`${rows.length} weapons written to js/weapons.js, ${saved.length} with a saved picture`)
