var _ = require('lodash');
const LogHelper = require('../helpers/log.helper.js');
const {loadImage} = require("canvas");

let ASPECT_DATA, TOME_DATA, WARD_DATA;
initAssets();

module.exports = {
    async createItemImage(ctx, reward, i, itemsPerRow, itemHeight, itemWidth, headerHeight, rowHeight, padding) {
        const rewardImageAndText = await getRewardImageAndText(reward);
        if (!rewardImageAndText) {
            return;
        }

        const row = Math.floor(i / itemsPerRow);
        const col = i % itemsPerRow;
        let x = padding + col * (itemWidth + padding);
        let y = headerHeight + row * rowHeight;

        try {
            // Draw the background Card
            const cardPadding = 15;
            const textSpace = 50;
            const totalCardHeight = itemHeight + textSpace;

            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.lineWidth = 2;
            roundRect(ctx, x, y, itemWidth, totalCardHeight, 10, true, true);

            // Item image in front
            const img = rewardImageAndText.image;

            const availableIconHeight = itemHeight - (cardPadding * 2);
            const hRatio = (itemWidth - (cardPadding * 2)) / img.width;
            const vRatio = availableIconHeight / img.height;
            const ratio = Math.min(hRatio, vRatio);
            const drawWidth = img.width * ratio;
            const drawHeight = img.height * ratio;
            const drawX = x + (itemWidth - drawWidth) / 2;
            const drawY = y + cardPadding;

            ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

            // Item name with color
            ctx.font = 'bold 16px sans-serif';

            const sidePadding = 20;
            const maxWidth = itemWidth - (sidePadding * 2);
            const words = rewardImageAndText.text.split(' ');
            let line1 = '';
            let line2 = '';

            // Distribute words into two lines because Mythic names are way too long
            for (const word of words) {
                if (ctx.measureText(line1 + (line1 ? ' ' : '') + word).width <= maxWidth) {
                    line1 += (line1 ? ' ' : '') + word;
                } else {
                    line2 += (line2 ? ' ' : '') + word;
                }
            }

            this.drawTextWithOutline(ctx, line1, x + (itemWidth / 2), y + itemHeight + 10, rewardImageAndText.textColor, 'black', 3);
            if (line2) {
                this.drawTextWithOutline(ctx, line2, x + (itemWidth / 2), y + itemHeight + 30, rewardImageAndText.textColor, 'black', 3);
            }
        } catch (e) {
            console.error('Asset could not be drawn: ' + JSON.stringify(reward, Object.getOwnPropertyNames(reward)));
            LogHelper.writeToLog('Asset could not be drawn: ' + JSON.stringify(reward, Object.getOwnPropertyNames(reward)));
        }
    },
    drawTextWithOutline(ctx, text, x, y, textColor, outlineColor = 'white', outlineWidth = 4) {
        ctx.textAlign = 'center';
        ctx.strokeStyle = outlineColor;
        ctx.lineWidth = outlineWidth;
        ctx.lineJoin = 'round';
        ctx.strokeText(text, x, y);
        ctx.fillStyle = textColor;
        ctx.fillText(text, x, y);
    },
}

async function getRewardImageAndText(reward) {
    let image;
    let text = reward.name;
    let textColor = '#FFFFFF';

    let imageUrl;
    switch (reward.type) {
        case 'ASPECT':
            textColor = getRarityColor(reward.tier);

            const aspectData = ASPECT_DATA[reward.name];
            if (!aspectData) {
                break;
            }

            imageUrl = 'raid-aspects/' + aspectData.icon;
            break;
        case 'TOME':

            // Some tomes don't actually exist, but the API thinks they do
            if (!reward.tier) {
                return null;
            }

            textColor = getRarityColor(reward.tier);

            const tomeDataKey = _.find(Object.keys(TOME_DATA), key => {
                return reward.name.toLowerCase().includes(key.toLowerCase());
            });

            if (tomeDataKey) {
                imageUrl = 'tomes/' + TOME_DATA[tomeDataKey].icon;
            }
            break;
        case 'WARD':
            const wardName = _.first(_.split(reward.name, ' '));
            const wardData = WARD_DATA[wardName];
            if (!wardData) {
                break;
            }

            textColor = wardData.textColor;
            imageUrl = 'wards/' + wardData.icon;
            break;
    }

    try {
        image = await loadImage( './assets/images/' + (imageUrl ? imageUrl : 'Empty') + '.png');
        return { image, text, textColor };
    } catch (e) {
        console.error('Asset could not be loaded: ' + JSON.stringify(reward, Object.getOwnPropertyNames(reward)));
        LogHelper.writeToLog('Asset could not be loaded: ' + JSON.stringify(reward, Object.getOwnPropertyNames(reward)));

        image = await loadImage( './assets/images/Empty' + '.png');
        return { image, text, textColor };
    }
}

function roundRect(ctx, x, y, width, height, radius, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
}

function getRarityColor(rarity) {
    switch (rarity?.toLowerCase()) {
        case 'legendary':
            return '#5FF';
        case 'fabled':
            return '#F55';
        case 'mythic':
            return '#A0A';
    }

    return '#FFFFFF';
}

// Assets
function initAssets() {

    // Wards
    WARD_DATA = {
        'Blue': { icon: 'Blue', textColor: '#55F' },
        'Green': { icon: 'Green', textColor: '#5F5' },
        'Orange': { icon: 'Orange', textColor: '#fc9e56' },
        'Pink': { icon: 'Pink', textColor: '#e83cfb' },
        'Purple': { icon: 'Purple', textColor: '#F5F' },
        'Red': { icon: 'Red', textColor: '#F55' },
        'Yellow': { icon: 'Yellow', textColor: '#FF5' },
    }

    // Tomes
    TOME_DATA = {
        'Mysticism': { icon: 'Mysticism' },
        'Marathon': { icon: 'Marathon' },
        'Lootrunning': { icon: 'Lootrunning' },
        'Guild': { icon: 'Guild' },
        'Expertise': { icon: 'Expertise' },
        'Defensive Mastery': { icon: 'Defensive Mastery' },
        'Combat Mastery': { icon: 'Combat Mastery' },
    };

    // Aspects
    ASPECT_DATA = {

        // --- MAGE ---
        "Aspect of the Apprentice's Bolt": { icon: "Mage" },
        "Aspect of the Comet": { icon: "Mage" },
        "Aspect of the Dimension's Door": { icon: "Mage" },
        "Aspect of the Magic Missile": { icon: "Mage" },
        "Aspect of the Ray of Frost": { icon: "Mage" },
        "Aspect of the Savior": { icon: "Mage" },
        "Aspect of a Scorching Sun": { icon: "Mage" },
        "Aspect of a Thousand Hours": { icon: "Mage" },
        "Aspect of Wind Walking": { icon: "Mage" },
        "Aspect of Indoctrination": { icon: "Mage" },
        "Aspect of the Vast Emptiness": { icon: "Mage" },
        "Aspect of Burning Providence": { icon: "Mage" },
        "Aspect of Fatal Fulguration": { icon: "Mage" },
        "Aspect of the Inescapable Void": { icon: "Mage" },
        "Aspect of Manaflux": { icon: "Mage" },
        "Aspect of Mystic Transfer": { icon: "Mage" },
        "Aspect of Runic Extravagance": { icon: "Mage" },
        "Aspect of Shining Status": { icon: "Mage" },
        "Aspect of Futures Rewritten": { icon: "Mage" },
        "Aspect of the Indescribable": { icon: "Mage" },
        "Aspect of the Forbidden Ritual": { icon: "Mage" },
        "Aspect of Limitless Knowledge": { icon: "Mage" },
        "Riftwalker's Embodiment of Reality Alteration": { icon: "Mage" },
        "Light Bender's Embodiment of Celestial Brilliance": { icon: "Mage" },
        "Arcanist's Embodiment of Total Obliteration": { icon: "Mage" },
        "Mage's Embodiment of Morbid Curiosity": { icon: "Mage" },

        // --- ARCHER ---
        "Aspect of Battlement Fortification": { icon: "Archer" },
        "Aspect of Bullet Hell": { icon: "Archer" },
        "Aspect of Clinging Lichen": { icon: "Archer" },
        "Aspect of Dynamic Entry": { icon: "Archer" },
        "Aspect of Extreme Firepower": { icon: "Archer" },
        "Aspect of Further Horizons": { icon: "Archer" },
        "Aspect of Illegal Explosives": { icon: "Archer" },
        "Aspect of the Iron String": { icon: "Archer" },
        "Aspect of the North Wind": { icon: "Archer" },
        "Aspect of the Thunderbolt": { icon: "Archer" },
        "Aspect of the Barley-Woven": { icon: "Archer" },
        "Aspect of Olfactorial Enhancement": { icon: "Archer" },
        "Aspect of the Beastmaster": { icon: "Archer" },
        "Aspect of Chaotic Demolition": { icon: "Archer" },
        "Aspect of Extreme Current": { icon: "Archer" },
        "Aspect of Fragmentation Rounds": { icon: "Archer" },
        "Aspect of the Heavenly Mandate": { icon: "Archer" },
        "Aspect of the Inexhaustible Quiver": { icon: "Archer" },
        "Aspect of the Poltergeist": { icon: "Archer" },
        "Aspect of the Steadying Hand": { icon: "Archer" },
        "Aspect of Undercrank": { icon: "Archer" },
        "Aspect of the Battle-Fletcher": { icon: "Archer" },
        "Boltslinger's Embodiment of Rended Skies": { icon: "Archer" },
        "Trapper's Embodiment of Persistence Predation": { icon: "Archer" },
        "Sharpshooter's Embodiment of Laser Precision": { icon: "Archer" },
        "Archer's Embodiment of Perceptive Finesse": { icon: "Archer" },

        // --- WARRIOR ---
        "Aspect of the Anvil Drop": { icon: "Warrior" },
        "Aspect of Bovine Inspiration": { icon: "Warrior" },
        "Aspect of Deafening Echoes": { icon: "Warrior" },
        "Aspect of Earthshaking": { icon: "Warrior" },
        "Aspect of Maniacal Frisson": { icon: "Warrior" },
        "Aspect of the Megaphone": { icon: "Warrior" },
        "Aspect of Overflowing Hope": { icon: "Warrior" },
        "Aspect of the Returning Javelin": { icon: "Warrior" },
        "Aspect of Skyward Strikes": { icon: "Warrior" },
        "Aspect of Steel Chords": { icon: "Warrior" },
        "Aspect of Turbulence": { icon: "Warrior" },
        "Aspect of the Humming Choir": { icon: "Warrior" },
        "Aspect of the Crimson Scrivener": { icon: "Warrior" },
        "Aspect of the Golden Dawn": { icon: "Warrior" },
        "Aspect of the Berserker": { icon: "Warrior" },
        "Aspect of Empowering Fantasy": { icon: "Warrior" },
        "Aspect of Hyper-Perception": { icon: "Warrior" },
        "Aspect of Rallying Fervor": { icon: "Warrior" },
        "Aspect of Rekindling": { icon: "Warrior" },
        "Aspect of Searing Friction": { icon: "Warrior" },
        "Aspect of Seeing Stars": { icon: "Warrior" },
        "Aspect of the Tightrope Walk": { icon: "Warrior" },
        "Aspect of Unquenching Flames": { icon: "Warrior" },
        "Aspect of the Enforcer": { icon: "Warrior" },
        "Fallen's Embodiment of Blind Fury": { icon: "Warrior" },
        "Battle Monk's Embodiment of Complete Synchrony": { icon: "Warrior" },
        "Paladin's Embodiment of Undying Determination": { icon: "Warrior" },
        "Warrior's Embodiment of Everlasting Perseverance": { icon: "Warrior" },

        // --- ASSASSIN ---
        "Aspect of Athleticism": { icon: "Assassin" },
        "Aspect of the Chain Knife": { icon: "Assassin" },
        "Aspect of Enduring Illusions": { icon: "Assassin" },
        "Aspect of Flamboyance": { icon: "Assassin" },
        "Aspect of the Fog Machine": { icon: "Assassin" },
        "Aspect of the Pinwheel": { icon: "Assassin" },
        "Aspect of Redoublement": { icon: "Assassin" },
        "Aspect of Shadow Armor": { icon: "Assassin" },
        "Aspect of the Stellar Flurry": { icon: "Assassin" },
        "Aspect of the Agile Blade": { icon: "Assassin" },
        "Aspect of the Airborne": { icon: "Assassin" },
        "Aspect of the Calling Card": { icon: "Assassin" },
        "Aspect of Clouded Vision": { icon: "Assassin" },
        "Aspect of the Dagger's Silhouette": { icon: "Assassin" },
        "Aspect of the Disappearing Act": { icon: "Assassin" },
        "Aspect of False Coercing": { icon: "Assassin" },
        "Aspect of the Pernicious Prankster": { icon: "Assassin" },
        "Aspect of Seeking Stars": { icon: "Assassin" },
        "Aspect of Sleight-Of-Hand": { icon: "Assassin" },
        "Aspect of the Unstoppable Force": { icon: "Assassin" },
        "Aspect of Unyielding Fate": { icon: "Assassin" },
        "Aspect of Visual Distortion": { icon: "Assassin" },
        "Shadestepper's Embodiment of Unseen Execution": { icon: "Assassin" },
        "Trickster's Embodiment of Malevolent Mischief": { icon: "Assassin" },
        "Acrobat's Embodiment of Gravity Defiance": { icon: "Assassin" },
        "Assassin's Embodiment of Otherworldly Detachment": { icon: "Assassin" },

        // --- SHAMAN ---
        "Aspect of Acceleration": { icon: "Shaman" },
        "Aspect of the Alraune's Roots": { icon: "Shaman" },
        "Aspect of Emanant Force": { icon: "Shaman" },
        "Aspect of Empathy": { icon: "Shaman" },
        "Aspect of Incineration": { icon: "Shaman" },
        "Aspect of Lashing Fire": { icon: "Shaman" },
        "Aspect of the Monolith": { icon: "Shaman" },
        "Aspect of Motivation": { icon: "Shaman" },
        "Aspect of Occupation": { icon: "Shaman" },
        "Aspect of Reverberation": { icon: "Shaman" },
        "Aspect of Surging Presence": { icon: "Shaman" },
        "Aspect of Summer Storms": { icon: "Shaman" },
        "Aspect of the Bodyguard": { icon: "Shaman" },
        "Aspect of the Blurred Line": { icon: "Shaman" },
        "Aspect of Gushing Blood": { icon: "Shaman" },
        "Aspect of the Amphibian": { icon: "Shaman" },
        "Aspect of the Beckoned Legion": { icon: "Shaman" },
        "Aspect of the Channeler": { icon: "Shaman" },
        "Aspect of Exsanguination": { icon: "Shaman" },
        "Aspect of Seismic Sense": { icon: "Shaman" },
        "Aspect of Stances": { icon: "Shaman" },
        "Aspect of the Artisan": { icon: "Shaman" },
        "Summoner's Embodiment of the Omnipotent Overseer": { icon: "Shaman" },
        "Ritualist's Embodiment of the Ancestral Avatar": { icon: "Shaman" },
        "Acolyte's Embodiment of Unwavering Adherence": { icon: "Shaman" },
        "Shaman's Embodiment of Serene Harmony": { icon: "Shaman" }
    };
}