const { parsePhoneNumberFromString } = require('libphonenumber-js')
const parsed = parsePhoneNumberFromString('+91756000899')
console.log('number:', parsed ? parsed.number : 'null')
