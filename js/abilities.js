const abilityImageBase = 'img/abilities/'

const abilityList = [
    ['Static Cling', '0001_h743ty2wez_staticcling/thumb_1.png', '', 0],
    ['Halitosis', '0010_p1yh839wh5_halitosis/thumb_10.png', '', 1],
    ['Drizzle', '0011_gh3efywu3b_drizzle/thumb_11.png', '', 1],
    ['Bandage', '0012_m2u8x3y7w_bandage/thumb_12.png', 'battle', 0],
    ['Meditate', '0013_7y43jzg4er_meditate/thumb_13.png', '', 4],
    ['Shade', '0014_jhuh934z0p_shade/thumb_14.png', '', 4],
    ['Cranky', '0015_q4h98hd2gu_cranky/thumb_15.png', 'battle', 0],
    ['Meh', '0016_4ehr7vwu3i_meh/thumb_16.png', 'battle', 0],
    ['Positive Thinking', '0017_v342uy79hz_thinkpositive/thumb_17.png', 'battle', 0],
    ['An Icicle', '0002_qx4b5ievrb_anicicle/thumb_2.png', '', 0],
    ['Sear', '0018_o3g5y729h8_sear/thumb_18.png', '', 2],
    ['Irritable Minions', '0019_i3h7d34uqp_irritableminions/thumb_19.png', '', 10],
    ['Throw Pillows', '0020_i43ghu9b8a_throwpillows/thumb_20.png', 'day', 0],
    ['Lens Flare', '0021_c4hje5rwjo_lensflare/thumb_21.png', 'battle', 0],
    ['Shhhhhhhhh...', '0022_u34y72hegr_shhhhhhhhh/thumb_22.png', 'battle', 0],
    ['Shroud', '0023_yj489reu4j_shroud/thumb_23.png', '', 0],
    ['Float', '0024_bh342iegwu_float/thumb_24.png', 'battle', 0],
    ['Burrow', '0025_wy54t93z8u_burrow/thumb_25.png', 'battle', 0],
    ['Tempest', '0026_ot4728gejs_tempest/thumb_26.png', 'day', 0],
    ["Snowager's Breath", '0027_e54u9o3rux_snowagersbreath/thumb_27.png', 'day', 0],
    ["Warlock's Rage", '0028_dy54g2o31z_warlocksrage/thumb_28.png', 'battle', 0],
    ['Healing Fire', '0003_c342ieuwds_healingfire/thumb_3.png', 'battle', 0],
    ['Rejuvenate', '0029_ah54yubiow_rejuvenate/thumb_29.png', 'battle', 0],
    ['Drain Life', '0030_d7h34sd92x_drainlife/thumb_30.png', 'battle', 0],
    ['Reflect', '0031_3hrei48dgh_reflect/thumb_31.png', 'battle', 0],
    ['Rally Cry', '0032_yh2u3wqv4b_rallycry/thumb_32.png', 'battle', 0],
    ['Adrenaline Rush', '0033_yq734ehvrw_adrenalinerush/thumb_33.png', 'battle', 0],
    ['Meepit Stampede', '0034_syb428iowu_meepitstampede/thumb_34.png', 'day', 0],
    ['Summon Monoceraptor', '0035_py72ri38gd_summonmonoceraptor/thumb_35.png', 'day', 0],
    ['Esophagor Stench', '0037_tgyuy43ui0_esophagorstench/thumb_37.png', 'day', 0],
]

// Look up by name, ignoring case, spaces and punctuation ("Warlocks Rage" finds "Warlock's Rage")
const abilityKey = name => (name || '').toLowerCase().replace(/[^a-z0-9]/g, '')
// id is Neopets' own ability number, the one in the picture's name (thumb_21 is Lens Flare)
const abilityIndex = {}
const abilityIds = {}
abilityList.forEach(([name, image, limit, cooldown]) => {
    const id = parseInt(image.match(/thumb_(\d+)/)[1])
    abilityIndex[abilityKey(name)] = abilityIds[id] = { name, image: `${abilityImageBase}thumb_${id}.png`, limit, cooldown, id }
})

function abilityInfo(name) {
    return abilityIndex[abilityKey(name)] || null
}

function abilityById(id) {
    return abilityIds[id] || null
}

const abilityNames = abilityList.map(([name]) => name)

if (typeof module !== 'undefined') module.exports = { abilityInfo, abilityById, abilityNames }
else {
    window.abilityInfo = abilityInfo
    window.abilityById = abilityById
    window.abilityNames = abilityNames
}
