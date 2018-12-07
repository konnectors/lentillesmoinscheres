const {
  BaseKonnector,
  requestFactory,
  signin,
  scrape,
  saveBills,
  log
} = require('cozy-konnector-libs')
const request = requestFactory({
  cheerio: true,
  json: false,
  jar: true
})
const omit = require('lodash/omit')

const baseUrl = 'https://www.lentillesmoinscheres.com'

module.exports = new BaseKonnector(start)

async function start(fields) {
  log('info', 'Authenticating ...')
  await authenticate(fields.email, fields.password)
  log('info', 'Successfully logged in')

  const bills = await getBills()

  log('info', 'Saving data to Cozy')
  await saveBills(bills, fields, {
    identifiers: ['lentilles']
  })
}

function authenticate(email, password) {
  return signin({
    url: `${baseUrl}/client_login.php`,
    formSelector: '#loginModal-form',
    formData: { email, password },
    validate: (statusCode, $, fullResponse) => {
      if (fullResponse.request.uri.href === `${baseUrl}/client/home.php`) {
        return true
      } else {
        log('error', 'error while login')
        return false
      }
    }
  })
}

async function getBills() {
  const $ = await request(`${baseUrl}/client/orders.php?filterInterval=all`)

  const docs = scrape(
    $,
    {
      number: '.orderRow-orderID span',
      amount: {
        sel: '.orderRow-data:nth-child(2)',
        parse: parseAmount
      },
      fileurl: {
        sel: '.display-invoice',
        attr: 'href',
        parse: href => `${baseUrl}/client/${href}`
      },
      date: {
        sel: '.orderRow-data:nth-child(1)',
        parse: parseDate
      }
    },
    '.orderRow'
  )

  const attrsNotToSave = ['number']

  return docs.map(doc => ({
    ...omit(doc, attrsNotToSave),
    filename: getFileName(doc),
    type: 'health_costs',
    vendor: 'Lentilles Moins Cheres',
    currency: '€',
    metadata: {
      importDate: new Date(),
      version: 1
    }
  }))
}

function parseAmount(rawAmount) {
  return parseFloat(rawAmount.replace(/[a-zA-Z: €]*/g, '').replace(',', '.'))
}

function parseDate(rawDate) {
  const [day, month, year] = rawDate.replace(/[a-zA-Z: ]/g, '').split('/')
  const date = new Date(2000 + parseInt(year), month - 1, day)

  return date
}

function getFileName(doc) {
  return `${doc.date.toISOString().slice(0, 10)}_${doc.number}_${
    doc.amount
  }.pdf`
}
