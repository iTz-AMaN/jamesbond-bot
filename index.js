const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const countryFlags = require('./flags');
const cheerio = require("cheerio");
const ibantools = require('ibantools');
const dotenv = require('dotenv');
dotenv.config();

const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// display all commands we have in this bot
bot.onText(/^\.cmds$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const messageId = msg.message_id;
    const userId = msg.from.id;
    const userMention = `[${userId}](tg://user?id=${userId})`;

    const commands = [
        '*_ 🚀 List of all commands_*\n\n',
        '*_\\.gen \\- Generates cards from bin_*\n',
        '*_\\.rnd "US" \\- Generates address of country_*\n',
        '*_\\.iban "IBAN" \\- Checks for IBAN_*\n',
        '*_\\.rbin "FULL CARD" \\- Checks BIN Info_*\n\n',
        `*_ 👤 USER: ${userMention}_*\n`,
        '*_🤖 Creator: @XxDoMiNiCxX_*'
    ];
    await bot.sendMessage(chatId, commands.join(''), { reply_to_message_id: messageId, parse_mode: 'MarkdownV2' });
})

// IBAN Validator .iban command
bot.onText(/^\.iban (.+)/, (msg, match) => {
    const startTime = new Date()
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const userMention = `[${userId}](tg://user?id=${userId})`;
    const rawInput = match[1].trim();
    const iban = rawInput.replace(/[^A-Z0-9]/gi, '').toUpperCase();

    try {
        if (ibantools.isValidIBAN(iban)) {
            const responseMessage = `
*_✅ Valid IBAN_*

*IBAN:* \`${iban}\`
*Country: ${iban.substring(0, 2)}* ${countryFlags[iban.substring(0, 2).toUpperCase() || 'N/A']}

*⌛ Time Took: \`${(Date.now() - startTime).toFixed(3).replace('.', '\\.')}s\`*
*👤 USER: ${userMention}*
*🤖 Creator: @XxDoMiNiCxX*
`;
            bot.sendMessage(chatId, responseMessage, { reply_to_message_id: msg.message_id, parse_mode: 'MarkdownV2' });
        } else {
            const responseMessage = `
❌ *_Invalid \`${iban}\` Detected_* 

*⌛ Time Took: \`${(Date.now() - startTime).toFixed(3).replace('.', '\\.')}s\`*
*👤 USER: ${userMention}*
*🤖 Creator: @XxDoMiNiCxX*
`;
            bot.sendMessage(chatId, responseMessage, { reply_to_message_id: msg.message_id, parse_mode: 'MarkdownV2' });
        }
    } catch (error) {
        console.error("Error validating IBAN:", error);
        bot.sendMessage(chatId, "An error occurred while validating the IBAN. Please try again.", { reply_to_message_id: msg.message_id });
    }

});

// Handler for the .gen command
bot.onText(/^\.gen\s(.+)/, async (msg, match) => {
    try {
        const chatId = msg.chat.id;
        const messageId = msg.message_id;
        const userId = msg.from.id;
        const userMention = `[${userId}](tg://user?id=${userId})`;
        const userInput = match[1].trim();

        // Split the input by common separators (|, /, space)
        const parts = userInput.split(/[|\/\s]+/).filter(part => part.trim() !== '');

        // Validate BIN
        if (!parts.length || parts[0].length < 6) {
            bot.sendMessage(chatId, `*_Please enter a valid bin, Example \\- 123456_*`, { reply_to_message_id: messageId, parse_mode: 'MarkdownV2' });
            return;
        }

        // Check if BIN contains at least some digits or X's (not just letters or special characters)
        const binWithX = parts[0];
        if (!/[0-9xX]/.test(binWithX)) {
            bot.sendMessage(chatId, `*_Invalid BIN format\\._*`, { reply_to_message_id: messageId, parse_mode: 'MarkdownV2' });
            return;
        }

        // Extract the other parameters
        let month = null, year = null, cvv = null;

        // Parse additional parameters if provided
        if (parts.length > 1) {
            if (parts.length >= 4) {
                // Format: BIN|MM|YY|CVV
                month = parts[1];
                year = parts[2];
                cvv = parts[3];
            } else if (parts.length === 3) {
                // Format: BIN|MM/YY|CVV or BIN|MM|YY
                if (parts[1].includes('/')) {
                    // Format: BIN|MM/YY|CVV
                    const expiryParts = parts[1].split('/');
                    month = expiryParts[0];
                    year = expiryParts.length > 1 ? expiryParts[1] : null;
                    cvv = parts[2];
                } else {
                    // Format: BIN|MM|YY
                    month = parts[1];
                    year = parts[2];
                }
            } else if (parts.length === 2) {
                // Format: BIN|MM/YY or BIN|CVV
                if (parts[1].includes('/')) {
                    // Format: BIN|MM/YY
                    const expiryParts = parts[1].split('/');
                    month = expiryParts[0];
                    year = expiryParts.length > 1 ? expiryParts[1] : null;
                } else {
                    // Check if it's more likely to be a CVV (3-4 digits) or a month
                    if (/^[0-9xX]{3,4}$/.test(parts[1])) {
                        cvv = parts[1];
                    } else {
                        month = parts[1];
                    }
                }
            }
        }

        // Validate month if provided
        if (month !== null && !/^[0-9xX]{1,2}$/.test(month)) {
            bot.sendMessage(chatId, `*_Invalid month format\\. Month must be 1\\-2 digits or contain X_*`, { reply_to_message_id: messageId, parse_mode: 'MarkdownV2' });
            return;
        }

        // Validate year if provided
        if (year !== null) {
            // Year should be either 2 or 4 digits, or contain X
            if (!/^[0-9xX]{2}$/.test(year) && !/^[0-9xX]{4}$/.test(year)) {
                bot.sendMessage(chatId, `*_Invalid year format\\. Year must be 2 or 4 digits or contain X_*`, { reply_to_message_id: messageId, parse_mode: 'MarkdownV2' });
                return;
            }
        }

        // Validate CVV if provided
        if (cvv !== null && !/^[0-9xX]{3,4}$/.test(cvv)) {
            bot.sendMessage(chatId, `*_Invalid CVV format\\. CVV must be 3\\-4 digits or contain X_*`, { reply_to_message_id: messageId, parse_mode: 'MarkdownV2' });
            return;
        }

        const startTime = new Date();

        // Determine card type and validate BIN
        const cardInfo = determineCardTypeAndValidate(binWithX);

        // Generate 5 cards
        const cards = [];
        const attemptLimit = 100; // Increased from 20 to give more chances to generate valid cards
        let attempts = 0;

        while (cards.length < 5 && attempts < attemptLimit) {
            attempts++;
            try {
                // Generate card number using the fixed algorithm
                const cardNo = generateValidCardNumber(binWithX, cardInfo);

                if (!cardNo) continue; // Skip if generation failed

                // Validate using Luhn algorithm as a final check
                if (!isValidLuhn(cardNo)) continue;

                // Handle expiry date
                let finalMonth, finalYear;
                if (month && year) {
                    // Use provided month/year but process them for each card
                    const finalExpiry = processExpiry(month, year);
                    [finalMonth, finalYear] = finalExpiry.split('/');
                } else {
                    // Generate random expiry
                    const randomExpiry = generateRandomExpiry();
                    [finalMonth, finalYear] = randomExpiry.split('/');
                }

                // Handle CVV
                const finalCvv = cvv ? processCvv(cvv, cardInfo.type) : generateRandomCvv(cardInfo.type);

                // Create formatted card
                const formattedCard = `${cardNo}|${finalMonth}|${finalYear}|${finalCvv}`;

                // Check if this exact card is already in our list (avoid duplicates)
                if (!cards.includes(formattedCard)) {
                    cards.push(formattedCard);
                }
            } catch (error) {
                console.error("Error generating card:", error);
                // Continue to the next attempt
            }
        }

        // Check if we were able to generate any cards
        if (cards.length === 0) {
            bot.sendMessage(chatId, `*_Failed to generate valid cards\\. Please check your BIN and try again\\._*`, { reply_to_message_id: messageId, parse_mode: 'MarkdownV2' });
            return;
        }

        const endTime = new Date();
        const timeTaken = ((endTime - startTime) / 1000).toFixed(3);

        // Format the response
        let response = '';
        response += `⚙️ *_Generation Successful_*\n\n`;
        response += `*BIN:* \`${binWithX}\`\n`;
        response += `*Card Type:* \`${cardInfo.type}\`\n`;
        response += `*Total Cards: ${cards.length}*\n\n`;

        // Escape special characters for MarkdownV2
        const escapedCards = cards.map(card =>
            card.replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1')
        );

        response += `\`${escapedCards.join('\`\n\`')}\`\n\n`;
        response += `*👤 User:* ${userMention}\n`;
        response += `*🕔 Time Taken:* \`${timeTaken}s\`\n`;
        response += `*🤖 Creator: @XxDoMiNiCxX*`;

        bot.sendMessage(chatId, response, {
            reply_to_message_id: messageId,
            parse_mode: 'MarkdownV2'
        }).catch(error => {
            console.error("Error sending message:", error);
            // Try sending without markdown if there's an error
            bot.sendMessage(chatId, "⚙️ Generation Successful\n\n" + cards.join('\n') + "\n\nCreator: @XxDoMiNiCxX", {
                reply_to_message_id: messageId
            });
        });
    } catch (error) {
        console.error("Error in card generation:", error);
        bot.sendMessage(msg.chat.id, "*_An error occurred\\. Please try again\\._*", {
            reply_to_message_id: msg.message_id,
            parse_mode: 'MarkdownV2'
        }).catch(() => {
            bot.sendMessage(msg.chat.id, "An error occurred. Please try again.", {
                reply_to_message_id: msg.message_id
            });
        });
    }
});

// Improved function to determine card type and validate BIN
function determineCardTypeAndValidate(bin) {
    // Remove any non-numeric or X characters from the BIN
    const cleanBin = bin.replace(/[^0-9xX]/g, '');
    
    // Create a pattern version of the BIN for validation
    const patternBin = cleanBin.replace(/[xX]/g, '[0-9]');
    
    // Get the first digit (or X)
    const firstDigit = cleanBin.charAt(0).toLowerCase();
    
    // Determine card type and length based on BIN prefix
    if (firstDigit === '3' || firstDigit === 'x') {
        // Get second digit if available
        const secondDigit = cleanBin.length >= 2 ? cleanBin.charAt(1).toLowerCase() : 'x';
        
        // American Express starts with 34 or 37
        if (secondDigit === '4' || secondDigit === '7' || secondDigit === 'x') {
            return { type: "AmEx", length: 15, prefixPattern: /^3[47]/ };
        }
        // JCB starts with 35
        else if (secondDigit === '5' || secondDigit === 'x') {
            return { type: "JCB", length: 16, prefixPattern: /^35/ };
        }
        // Diners Club starts with 36, 38, 39
        else if (['6', '8', '9'].includes(secondDigit) || secondDigit === 'x') {
            return { type: "DinersClub", length: 14, prefixPattern: /^3[689]/ };
        }
        // Default for 3x
        return { type: "Other", length: 16, prefixPattern: /^3/ };
    } 
    else if (firstDigit === '4' || firstDigit === 'x') {
        // Visa starts with 4
        return { type: "Visa", length: 16, prefixPattern: /^4/ };
    } 
    else if (firstDigit === '5' || firstDigit === 'x') {
        // Get second digit if available
        const secondDigit = cleanBin.length >= 2 ? cleanBin.charAt(1).toLowerCase() : 'x';
        
        // Mastercard starts with 51-55
        if ('12345'.includes(secondDigit) || secondDigit === 'x') {
            return { type: "Mastercard", length: 16, prefixPattern: /^5[1-5]/ };
        }
        // Default for 5x
        return { type: "Other", length: 16, prefixPattern: /^5/ };
    } 
    else if (firstDigit === '6' || firstDigit === 'x') {
        // Get additional digits if available
        const secondDigit = cleanBin.length >= 2 ? cleanBin.charAt(1).toLowerCase() : 'x';
        const thirdDigit = cleanBin.length >= 3 ? cleanBin.charAt(2).toLowerCase() : 'x';
        const fourthDigit = cleanBin.length >= 4 ? cleanBin.charAt(3).toLowerCase() : 'x';
        
        // Discover starts with 6011, 644-649, or 65
        if (secondDigit === '0' && thirdDigit === '1' && fourthDigit === '1') {
            return { type: "Discover", length: 16, prefixPattern: /^6011/ };
        }
        else if (secondDigit === '4' && ('456789'.includes(thirdDigit) || thirdDigit === 'x')) {
            return { type: "Discover", length: 16, prefixPattern: /^64[4-9]/ };
        }
        else if (secondDigit === '5') {
            return { type: "Discover", length: 16, prefixPattern: /^65/ };
        }
        // UnionPay starts with 62
        else if (secondDigit === '2') {
            return { type: "UnionPay", length: 16, prefixPattern: /^62/ };
        }
        // Default for 6x
        return { type: "Other", length: 16, prefixPattern: /^6/ };
    } 
    else if (firstDigit === '2' || firstDigit === 'x') {
        // Mastercard 2-series starts with 2221-2720
        return { type: "Mastercard", length: 16, prefixPattern: /^2/ };
    }
    else if (firstDigit === '1' || firstDigit === 'x') {
        // UATP cards start with 1
        return { type: "UATP", length: 15, prefixPattern: /^1/ };
    }
    else {
        // Default for other BINs
        return { type: "Generic", length: 16, prefixPattern: /^[0-9]/ };
    }
}

// Completely rewritten function to generate valid card numbers
function generateValidCardNumber(binWithX, cardInfo) {
    try {
        // Clean the BIN: remove non-numeric or non-X characters
        const cleanBin = binWithX.replace(/[^0-9xX]/g, '');

        // Determine the target card length
        const targetLength = cardInfo.length;

        // Step 1: Handle the BIN part
        let cardNumber = '';

        // Process each character of the BIN
        for (let i = 0; i < cleanBin.length && i < targetLength - 1; i++) {
            const char = cleanBin.charAt(i).toLowerCase();

            if (char === 'x') {
                // Special handling for first and second positions based on card type
                if (i === 0) {
                    // First digit depends on card type
                    switch (cardInfo.type) {
                        case "AmEx": cardNumber += '3'; break;
                        case "Visa": cardNumber += '4'; break;
                        case "Mastercard":
                            // Randomly choose between '2' and '5' for Mastercard
                            cardNumber += Math.random() < 0.5 ? '5' : '2';
                            break;
                        case "Discover": cardNumber += '6'; break;
                        default: cardNumber += Math.floor(Math.random() * 10).toString();
                    }
                }
                else if (i === 1) {
                    // Second digit depends on first digit and card type
                    const firstDigit = cardNumber.charAt(0);

                    if (firstDigit === '3' && cardInfo.type === "AmEx") {
                        // AmEx second digit is 4 or 7
                        cardNumber += Math.random() < 0.5 ? '4' : '7';
                    }
                    else if (firstDigit === '5' && cardInfo.type === "Mastercard") {
                        // Mastercard second digit is 1-5 if first digit is 5
                        cardNumber += (Math.floor(Math.random() * 5) + 1).toString();
                    }
                    else if (firstDigit === '2' && cardInfo.type === "Mastercard") {
                        // For Mastercard 2-series, handle the 2221-2720 range
                        // We'll simplify and use the middle of the range
                        cardNumber += '5';
                    }
                    else {
                        // For other positions, use random digit
                        cardNumber += Math.floor(Math.random() * 10).toString();
                    }
                }
                else {
                    // For other positions, use random digit
                    cardNumber += Math.floor(Math.random() * 10).toString();
                }
            }
            else {
                // Use the actual digit from the BIN
                cardNumber += char;
            }
        }

        // Step 2: Fill remaining digits (before the check digit)
        while (cardNumber.length < targetLength - 1) {
            cardNumber += Math.floor(Math.random() * 10).toString();
        }

        // Step 3: Calculate and append the Luhn check digit
        return addLuhnCheckDigit(cardNumber);

    } catch (error) {
        console.error("Error generating card number:", error);
        return null;
    }
}

// Improved function to calculate Luhn check digit
function addLuhnCheckDigit(partialCardNumber) {
    try {
        // Calculate sum according to Luhn algorithm
        let sum = 0;
        let alternate = false;

        for (let i = partialCardNumber.length - 1; i >= 0; i--) {
            let digit = parseInt(partialCardNumber.charAt(i), 10);

            if (alternate) {
                digit *= 2;
                if (digit > 9) {
                    digit -= 9;
                }
            }

            sum += digit;
            alternate = !alternate;
        }

        // Calculate check digit
        const checkDigit = (10 - (sum % 10)) % 10;

        // Append check digit to card number
        return partialCardNumber + checkDigit;
    } catch (error) {
        console.error("Error adding Luhn check digit:", error);
        return null;
    }
}

// Function to validate a card number using the Luhn algorithm
function isValidLuhn(cardNumber) {
    try {
        // Remove any non-digit characters
        const cleanCardNumber = cardNumber.replace(/\D/g, '');

        let sum = 0;
        let alternate = false;

        // Process from right to left
        for (let i = cleanCardNumber.length - 1; i >= 0; i--) {
            let digit = parseInt(cleanCardNumber.charAt(i), 10);

            if (alternate) {
                digit *= 2;
                if (digit > 9) {
                    digit -= 9;
                }
            }

            sum += digit;
            alternate = !alternate;
        }

        // Valid if sum is divisible by 10
        return sum % 10 === 0;
    } catch (error) {
        console.error("Error validating Luhn:", error);
        return false;
    }
}

function processExpiry(month, year) {
    try {
        if (!month || !year) {
            return generateRandomExpiry();
        }

        // Process month and year separately
        const finalMonth = processExpiryPart(month, true);  // true indicates it's a month
        const finalYear = processExpiryPart(year, false);   // false indicates it's a year

        return `${finalMonth}/${finalYear}`;
    } catch (error) {
        console.error("Error in processExpiry:", error);
        return generateRandomExpiry();
    }
}

function processExpiryPart(part, isMonth = false) {
    try {
        if (!part) {
            return isMonth ?
                Math.floor(1 + Math.random() * 12).toString().padStart(2, '0') :
                (new Date().getFullYear() + Math.floor(1 + Math.random() * 5)).toString().slice(-2);
        }

        // If it's all x's, generate a random value
        if (/^[xX]+$/.test(part)) {
            return isMonth ?
                Math.floor(1 + Math.random() * 12).toString().padStart(2, '0') :
                (new Date().getFullYear() + Math.floor(1 + Math.random() * 5)).toString().slice(-2);
        }

        // If it contains x's, replace them with random digits
        if (part.toLowerCase().includes('x')) {
            const replaced = part.replace(/[xX]/g, () => Math.floor(Math.random() * 10).toString());

            // Validate the result
            if (isMonth) {
                // For month, ensure it's between 01-12
                const monthNum = parseInt(replaced, 10);
                if (isNaN(monthNum) || monthNum < 1 || monthNum > 12 || replaced.length > 2) {
                    return Math.floor(1 + Math.random() * 12).toString().padStart(2, '0');
                }
                return monthNum.toString().padStart(2, '0');
            } else {
                // For year, handle both 2-digit and 4-digit formats
                const yearNum = parseInt(replaced, 10);
                const currentYear = new Date().getFullYear();

                // Check if it's a 4-digit year format
                if (replaced.length === 4) {
                    if (isNaN(yearNum) || yearNum < currentYear) {
                        return (currentYear + Math.floor(1 + Math.random() * 5)).toString();
                    }
                    return replaced;
                }
                // Treat as 2-digit year format (default)
                else {
                    if (replaced.length > 2 || isNaN(yearNum)) {
                        return (currentYear + Math.floor(1 + Math.random() * 5)).toString().slice(-2);
                    }

                    // Make sure the 2-digit year is in the future
                    const fullYear = parseInt("20" + replaced, 10);
                    if (fullYear < currentYear) {
                        return (currentYear + Math.floor(1 + Math.random() * 5)).toString().slice(-2);
                    }

                    return replaced.padStart(2, '0');
                }
            }
        }

        // If it doesn't contain x's, validate and use it
        if (isMonth) {
            const monthNum = parseInt(part, 10);
            if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
                return Math.floor(1 + Math.random() * 12).toString().padStart(2, '0');
            }
            return monthNum.toString().padStart(2, '0');
        } else {
            // For year, handle both 2-digit and 4-digit formats
            const yearNum = parseInt(part, 10);
            const currentYear = new Date().getFullYear();

            // Check if it's a 4-digit year format
            if (part.length === 4) {
                if (isNaN(yearNum) || yearNum < currentYear) {
                    return (currentYear + Math.floor(1 + Math.random() * 5)).toString();
                }
                return part;
            }
            // Treat as 2-digit year format (default)
            else {
                if (part.length > 2 || isNaN(yearNum)) {
                    return (currentYear + Math.floor(1 + Math.random() * 5)).toString().slice(-2);
                }

                // Make sure the 2-digit year is in the future
                const fullYear = parseInt("20" + part, 10);
                if (fullYear < currentYear) {
                    return (currentYear + Math.floor(1 + Math.random() * 5)).toString().slice(-2);
                }

                return part.padStart(2, '0');
            }
        }
    } catch (error) {
        console.error("Error in processExpiryPart:", error);
        // Return safe defaults
        return isMonth ?
            Math.floor(1 + Math.random() * 12).toString().padStart(2, '0') :
            (new Date().getFullYear() + Math.floor(1 + Math.random() * 5)).toString().slice(-2);
    }
}

function processCvv(cvv, cardType) {
    try {
        if (!cvv) {
            return generateRandomCvv(cardType);
        }

        // Determine CVV length based on card type
        const cvvLength = (cardType === "AmEx") ? 4 : 3;

        // If CVV is exactly 'x', 'xx', 'xxx', or 'xxxx', generate a completely random CVV
        if (/^[xX]+$/.test(cvv)) {
            return generateRandomCvv(cardType);
        }

        // If CVV contains any 'x' characters, replace them with random digits
        if (cvv.toLowerCase().includes('x')) {
            let processedCvv = cvv.replace(/[xX]/g, () => Math.floor(Math.random() * 10).toString());

            // Ensure correct length
            if (processedCvv.length > cvvLength) {
                processedCvv = processedCvv.substring(0, cvvLength);
            } else while (processedCvv.length < cvvLength) {
                processedCvv += Math.floor(Math.random() * 10).toString();
            }

            return processedCvv;
        }

        // If CVV doesn't contain 'x', use it as is but ensure correct length
        if (cvv.length > cvvLength) {
            return cvv.substring(0, cvvLength);
        } else while (cvv.length < cvvLength) {
            cvv += Math.floor(Math.random() * 10).toString();
        }

        return cvv;
    } catch (error) {
        console.error("Error in processCvv:", error);
        return generateRandomCvv(cardType);
    }
}

function generateRandomExpiry() {
    try {
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        const currentMonth = currentDate.getMonth() + 1; // JavaScript months are 0-indexed

        // Generate a random year between current year and current year + 5
        const year = (currentYear + Math.floor(1 + Math.random() * 5)).toString().slice(-2);

        let month;
        if (year === currentYear.toString().slice(-2)) {
            // If it's the current year, make sure the month is in the future
            month = Math.floor(currentMonth + 1 + Math.random() * (12 - currentMonth)).toString().padStart(2, '0');
        } else {
            // Otherwise, any month is fine
            month = Math.floor(1 + Math.random() * 12).toString().padStart(2, '0');
        }

        return `${month}/${year}`;
    } catch (error) {
        console.error("Error in generateRandomExpiry:", error);
        // Return a safe default
        const year = (new Date().getFullYear() + 2).toString().slice(-2);
        const month = "06"; // Middle of the year
        return `${month}/${year}`;
    }
}

function generateRandomCvv(cardType) {
    try {
        // AmEx uses 4-digit CVV, others use 3-digit
        const length = (cardType === "AmEx") ? 4 : 3;

        // Generate random CVV of appropriate length
        let cvv = "";
        for (let i = 0; i < length; i++) {
            cvv += Math.floor(Math.random() * 10).toString();
        }

        return cvv;
    } catch (error) {
        console.error("Error in generateRandomCvv:", error);
        // Return a safe default
        return (cardType === "AmEx") ? "1234" : "123";
    }
}

// Handler for the .rbin or /rbin command
bot.onText(/^\/rbin\s(.+)|^\.rbin\s(.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const messageId = msg.message_id;
    const userId = msg.from.id;
    const userMention = `[${userId}](tg://user?id=${userId})`;
    const userInput = match[1] || match[2];

    const [cc, mm, yy, cvv] = userInput.split(/[\|\/\s\n]+/);
    const progressMsg = await bot.sendMessage(chatId, `*Waiting for result...*`, { reply_to_message_id: messageId, parse_mode: 'Markdown' });

    const updateProgressBar = async (progress) => {
        const progressBar = '*' + '■'.repeat(progress / 10) + '□'.repeat(10 - progress / 10) + ` ${progress}%*`;
        await bot.editMessageText(`*Waiting for result...*\n${progressBar}`, { chat_id: chatId, message_id: progressMsg.message_id, parse_mode: 'Markdown' });
    };
    await updateProgressBar(30);

    const random = [60, 70, 80, 90, 100];
    const Num = Math.floor(Math.random() * random.length);

    // Post Data -
    const rbinPost = `{"environment_key":"5DeiEKz3bAzl2urQyBTc9tLKoRv","payment_method":{"credit_card":{"number":"${cc}","verification_value":"199","first_name":"James","last_name":"Bond","month":"12","year":"2028"}}}`;

    try {
        const response = await axios.post(
            'https://core.spreedly.com/v1/payment_methods/restricted.json?from=iframe&v=1.125',
            rbinPost,
            {
                headers: {
                    'authority': 'core.spreedly.com',
                    'Accept': '*/*',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Cache-Control': 'no-cache',
                    'Content-Type': 'application/json',
                    'Origin': 'https://core.spreedly.com',
                    'Pragma': 'no-cache',
                    'Referer': 'https://core.spreedly.com/v1/embedded/number-frame-1.125.html',
                    'Spreedly-Environment-Key': '5DeiEKz3bAzl2urQyBTc9tLKoRv',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
                }
            }
        );

        await updateProgressBar(random[Num]);

        const binInfo = response.data.transaction.payment_method.bin_metadata;

        const card_brand = binInfo.card_brand;
        const card_type = binInfo.card_type;
        const card_category = binInfo.card_category;
        const issuing_bank = binInfo.issuing_bank;
        const bin_type = binInfo.bin_type;
        const regulated = binInfo.regulated;
        const issuing_country_iso_name = binInfo.issuing_country_iso_name;
        const issuing_country_iso_a2_code = binInfo.issuing_country_iso_a2_code;
        const countryFlag = countryFlags[issuing_country_iso_a2_code] || '🏳️';

        const binFormat =
            `   
*\\=✪ GATE BIN CHK \\(v2\\) ✪\\=*

*╔════════════════╗*
*╠ BIN / IIN :* \`${response.data.transaction.payment_method.first_six_digits}\`
*╠ BRAND :* \`${card_brand}\`
*╠ TYPE :* \`${card_type}\`
*╠ LEVEL :* \`${card_category}\`
*╠ MORE INFO :* \`${bin_type} | ${regulated}\`
*╠ BANK :* \`${issuing_bank}\`
*╠ FROM :* \`${issuing_country_iso_name}\` *\\(${countryFlag}\\)*
*╚════════════════╝*

*👤 USER : ${userMention}*
*🤖 CREATOR : @XxDoMiNiCxX*
`

        await bot.editMessageText(binFormat, { chat_id: chatId, message_id: progressMsg.message_id, parse_mode: 'MarkdownV2' });
    } catch (error) {
        // console.log(error.response.data.errors[0].message);
        await bot.editMessageText(`*_An error occurred: ${error.response.data.errors[0].message}_*`, { chat_id: chatId, message_id: progressMsg.message_id, parse_mode: 'MarkdownV2' });
    }
});

bot.onText(/^\.rnd\s([A-Za-z]{2})$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const messageId = msg.message_id;
    const userId = msg.from.id;
    const userMention = `[${userId}](tg://user?id=${userId})`;
    const countryCode = match[1].toUpperCase();
    const startDate = new Date();

    const progressMsg = await bot.sendMessage(chatId, `*_Generating random address for ${countryCode}_*`, { reply_to_message_id: messageId, parse_mode: 'MarkdownV2' });

    try {
        const response = await axios.get(`https://www.bestrandoms.com/random-address-in-${countryCode}`,
            {
                headers: {
                    'authority': 'www.bestrandoms.com',
                    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                    'accept-language': 'en-US,en;q=0.9',
                    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36'
                }
            }
        );

        const $ = cheerio.load(response.data);
        const firstAddressBlock = $('.list-unstyled li.col-sm-6').first();

        const street = firstAddressBlock.find("b:contains('Street:')").parent().text().replace('Street:', '').trim();
        const city = firstAddressBlock.find("b:contains('City:')").parent().text().replace('City:', '').trim();
        const state = firstAddressBlock.find("b:contains('State/province/area:')").parent().text().replace('State/province/area:', '').trim();
        const zip = firstAddressBlock.find("b:contains('Zip code:')").parent().text().replace('Zip code:', '').trim();
        const country = firstAddressBlock.find("b:contains('Country:')").parent().text().replace('Country:', '').trim();
        const addressFormat = `   
*=✪ GATE ADDRESS GEN (v1) ✪=*

*╔════════════════╗*
*╠ STREET :* \`${street || 'N/A'}\`
*╠ CITY :* \`${city || 'N/A'}\`
*╠ STATE :* \`${state || 'N/A'}\`
*╠ ZIP :* \`${zip || 'N/A'}\`
*╠ COUNTRY :* \`${country || 'N/A'}\` *${countryFlags[countryCode] || (countryCode)}*
*╚════════════════╝*

*⌛ Time Taken:* \`${((new Date() - startDate) / 1000).toFixed(3)}s\`
*👤 USER:* ${userMention}
*🤖 Creator: @XxDoMiNiCxX*
`;

        await bot.editMessageText(addressFormat, { chat_id: chatId, message_id: progressMsg.message_id, parse_mode: 'Markdown' });
    } catch (error) {
        // Handle any errors
        bot.sendMessage(chatId, `An error occurred: ${error.message}`, { reply_to_message_id: messageId, parse_mode: 'Markdown' });
    }
});

console.log('Bot is running...');
