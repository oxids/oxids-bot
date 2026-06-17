var _ = require('lodash');
const LogHelper = require('../helpers/log.helper.js');
const WynnApiHelper = require('../helpers/wynn-api.helper.js');
const {loadImage} = require("canvas");

let ASPECT_DATA, WARD_DATA, ITEM_DATA;
let assetsInitialized = false;

module.exports = {
    async createItemImage(ctx, reward, i, itemsPerRow, itemHeight, itemWidth, headerHeight, rowHeight, padding) {
        if (!assetsInitialized) {
            async function initAssets() {

                // Items & Aspects are loaded from Wynncraft API
                ASPECT_DATA = await WynnApiHelper.getAllAspects() || [];
                ITEM_DATA = await WynnApiHelper.getAllItems() || [];

                // Wards
                WARD_DATA = {
                    'Blue': { icon: 'Blue', textColor: '#55F' },
                    'Green': { icon: 'Green', textColor: '#5F5' },
                    'Orange': { icon: 'Orange', textColor: '#fc9e56' },
                    'Pink': { icon: 'Pink', textColor: '#e83cfb' },
                    'Purple': { icon: 'Purple', textColor: '#F5F' },
                    'Red': { icon: 'Red', textColor: '#F55' },
                    'Yellow': { icon: 'Yellow', textColor: '#FF5' },
                };
            }

            await initAssets();
            assetsInitialized = true;
        }

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

            // Item names
            const sidePadding = 20;
            const maxWidth = itemWidth - (sidePadding * 2);

            ctx.font = 'bold 15px sans-serif';
            this.drawTextWithOutline(ctx, getTruncatedText(ctx, cleanString(rewardImageAndText.text), maxWidth), x + (itemWidth / 2), y + itemHeight + 5, rewardImageAndText.textColor, 'black', 3);
            if (rewardImageAndText.text2) {
                ctx.font = 'bold 12px sans-serif';

                let line1 = '';
                let line2 = '';
                for (let word of _.split(cleanString(rewardImageAndText.text2, true), ' ')) {
                    if (!line2 && ctx.measureText(line1 + word + ' ').width <= maxWidth) {
                        line1 += word + ' ';
                    } else {
                        line2 += word + ' ';
                    }
                }

                this.drawTextWithOutline(ctx, getTruncatedText(ctx, line1, maxWidth), x + (itemWidth / 2), y + itemHeight + 25, rewardImageAndText.textColor, 'black', 3);
                if (line2.length > 0) {
                    this.drawTextWithOutline(ctx, getTruncatedText(ctx, line2, maxWidth), x + (itemWidth / 2), y + itemHeight + 40, rewardImageAndText.textColor, 'black', 3);
                }
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
    let text2 = '';
    let textColor = '#FFFFFF';

    let imageUrl, itemData;
    switch (reward.type) {
        case 'ASPECT':
            textColor = getRarityColor(reward.tier);

            itemData = _.find(ASPECT_DATA, aspect => reward.name.toLowerCase() === aspect.name?.toLowerCase());
            if (itemData?.icon?.value?.name) {
                text = itemData.name;
                imageUrl = 'raid-aspects/' + itemData.icon.value.name;
            }

            // Always display text from final tier
            if (itemData?.tiers) {
                text2 += ' ('

                const tier = itemData.tiers[_.last(Object.keys(itemData.tiers))];
                for (const desc of tier.description) {
                    text2 += cleanString(desc) + ' ';
                }

                text2 = text2.substring(0, text2.length - 1);
                text2 += ')'
            }
            break;
        case 'TOME':

            // Some tomes don't actually exist, but the API thinks they do
            if (!reward.tier) {
                return null;
            }

            textColor = getRarityColor(reward.tier);

            itemData = _.find(ITEM_DATA, item => reward.name.toLowerCase() === item.displayName?.toLowerCase() && item.type !== 'ingredient');
            if (itemData?.icon?.value?.name) {
                text = itemData.displayName;
                imageUrl = 'tomes/' + itemData.icon.value.name;
            }

            // Add the identifications as well
            if (itemData?.identifications) {
                text2 += ' ('
                for (const id of Object.keys(itemData.identifications)) {
                    if (!id) {
                        continue;
                    }

                    // Make the text a bit nicer
                    const formattedId = id
                        .replace(/([A-Z])/g, ' $1')
                        .replace(/^./, (str) => str.toUpperCase())
                        .trim();

                    text2 += formattedId + ', ';
                }

                text2 = text2.substring(0, text2.length - 2);
                text2 += ')'
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
        case 'ITEM':

            // Some items don't actually exist, but the API thinks they do
            if (!reward.tier) {
                return null;
            }

            textColor = getRarityColor(reward.tier);

            itemData = _.find(ITEM_DATA, item => reward.name.toLowerCase() === item.displayName?.toLowerCase() && item.type !== "ingredient");
            if (itemData?.icon?.value?.name) {
                text = itemData.displayName;
                imageUrl = 'items/' + itemData.icon.value.name;
            }

            if (reward.shiny) {
                text += ' (Shiny)';
            }
            break;
    }

    try {
        image = await loadImage( './assets/images/' + (imageUrl ? imageUrl : 'Empty') + '.png');
    } catch (e) {
        console.error('Asset could not be loaded: ' + imageUrl + ' ' + JSON.stringify(reward, Object.getOwnPropertyNames(reward)));
        LogHelper.writeToLog('Asset could not be loaded: ' + imageUrl + ' ' +  JSON.stringify(reward, Object.getOwnPropertyNames(reward)));

        image = await loadImage( './assets/images/Empty' + '.png');
    }

    return { image, text, textColor, text2 };
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
        case 'unique':
            return '#ffe600';
        case 'rare':
            return '#ff00dd';
        case 'legendary':
            return '#5FF';
        case 'fabled':
            return '#F55';
        case 'mythic':
            return '#A0A';
    }

    return '#FFFFFF';
}

function getTruncatedText(ctx, text, maxWidth) {
    let width = ctx.measureText(text).width;
    if (width <= maxWidth) {
        return text;
    }

    let truncated = text;
    while (ctx.measureText(truncated + '...').width > maxWidth && truncated.length > 0) {
        truncated = truncated.slice(0, -1);
    }

    return truncated + '...';
}

// This was fully written by AI
function cleanString(input, removeFinalDot) {

    // 1. Remove HTML tags
    let text = input.replace(/<[^>]*>?/gm, '');

    // 2. Remove Unicode icons (Private Use Area)
    text = text.replace(/[\uE000-\uF8FF]/g, '');

    // 3. Remove content inside brackets ONLY if it's just whitespace or symbols
    text = text.replace(/\(([^)]*)\)/g, (match, contents) => {
        // Remove everything that isn't a letter or number from inside the ()
        const cleanedContents = contents.replace(/[^\w\s+-.,%]/g, '').trim();

        // If nothing is left inside, return empty string to remove the ()
        // Otherwise, return the cleaned contents inside the ()
        return cleanedContents.length > 0 ? `(${cleanedContents})` : '';
    });

    // 4. Cleanup: Remove double spaces and trim
    text = text.replace(/\s+/g, ' ').trim();

    // 5. Remove final dot if requested
    if (removeFinalDot) {
        if (text.endsWith('.')) {
            text = text.slice(0, -1);
        } else if (text.endsWith('.)')) {
            text = text.slice(0, -2) + ')';
        }
    }

    if (input.includes('Eldritch')) {
        console.log("INPUT: '" + input + "'");
        console.log("OUTPUT: '" + text + "'");

    }
    return text;
}