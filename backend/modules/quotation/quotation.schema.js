const paginationQuery = {
  type: 'object',
  properties: {
    limit: { type: 'integer', minimum: 1, maximum: 100 },
    offset: { type: 'integer', minimum: 0 },
  },
}

const idField = {
  anyOf: [
    { type: 'integer' },
    { type: 'string', pattern: '^[0-9]+$' },
  ],
}

const idParam = {
  type: 'object',
  required: ['id'],
  properties: { id: idField },
}

const leadIdParam = {
  type: 'object',
  required: ['leadId'],
  properties: { leadId: idField },
}

const groupIdParam = {
  type: 'object',
  required: ['groupId'],
  properties: { groupId: idField },
}

const createQuoteGroup = {
  body: {
    type: 'object',
    required: ['leadId', 'title'],
    properties: {
      leadId: { type: 'integer' },
      title: { type: 'string', minLength: 1 },
    },
  },
}

const createQuoteVersion = {
  body: {
    type: 'object',
    properties: {
      targetPrice: { type: 'number' },
      softDiscountPrice: { type: 'number' },
      minimumPrice: { type: 'number' },
      draftDataJson: { type: 'object' },
      createdBy: { type: 'integer' },
      status: { type: 'string' },
    },
  },
}

const updateQuoteVersion = {
  body: {
    type: 'object',
    properties: {
      status: { type: 'string' },
      salesOverridePrice: { type: 'number' },
      overrideReason: { type: 'string' },
      targetPrice: { type: 'number' },
      softDiscountPrice: { type: 'number' },
      minimumPrice: { type: 'number' },
      draftDataJson: { type: 'object' },
    },
  },
}

const draftAutosave = {
  body: {
    type: 'object',
    required: ['draftDataJson'],
    properties: {
      draftDataJson: { type: 'object' },
    },
  },
}

const addPricingItems = {
  body: {
    type: 'object',
    required: ['items'],
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          required: ['itemType', 'catalogId', 'quantity'],
          properties: {
            itemType: { type: 'string' },
            catalogId: { type: 'integer' },
            quantity: { type: 'integer', minimum: 1 },
            unitPrice: { type: 'number' },
          },
        },
      },
    },
  },
}

const negotiationCreate = {
  body: {
    type: 'object',
    required: ['type', 'message'],
    properties: {
      type: { type: 'string' },
      message: { type: 'string', minLength: 1 },
      createdBy: { type: 'integer' },
    },
  },
}

const submitVersion = {
  body: {
    type: 'object',
    properties: {
      note: { type: 'string' },
    },
  },
}

const approveVersion = {
  body: {
    type: 'object',
    properties: {
      note: { type: 'string' },
      approvedBy: { type: 'integer' },
    },
  },
}

const rejectVersion = {
  body: {
    type: 'object',
    properties: {
      note: { type: 'string' },
      rejectedBy: { type: 'integer' },
    },
  },
}

const sendVersion = {
  body: {
    type: 'object',
    properties: {
      expiresAt: { type: 'string', format: 'date-time' },
    },
  },
}

const updateQuoteGroup = {
  body: {
    type: 'object',
    required: ['title'],
    properties: {
      title: { type: 'string', minLength: 1 },
    },
  },
}

module.exports = {
  paginationQuery,
  idParam,
  leadIdParam,
  groupIdParam,
  createQuoteGroup,
  createQuoteVersion,
  updateQuoteVersion,
  draftAutosave,
  addPricingItems,
  negotiationCreate,
  submitVersion,
  approveVersion,
  rejectVersion,
  sendVersion,
  updateQuoteGroup,
}
