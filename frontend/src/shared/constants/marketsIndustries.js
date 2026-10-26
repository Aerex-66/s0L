// Markets, Industries, and Leadership Structure
// Comprehensive reference for Americas markets, industries, and organizational leadership

// ============================================================================
// AMERICAS MARKETS
// ============================================================================
export const AMERICAS_MARKETS = {
  DISTRIBUTION: {
    name: 'Distribution',
    code: 'DIST',
    description: 'Distribution market segment',
    businessApplicationsLeader: 'John Terzis',
    marketLeader: 'Mark Towell',
    sapMarketLeader: 'Jeff Reichardt',
    industries: ['CPG', 'Retail', 'Travel & Transportation']
  },
  INDUSTRIAL_COMMUNICATIONS: {
    name: 'Industrial/Communications',
    code: 'IND_COMMS',
    description: 'Industrial and Communications market segment',
    businessApplicationsLeader: 'Marc Hayem',
    marketLeader: 'Rafi Ezry',
    sapMarketLeaders: ['David Reuter', 'David Shay', 'Perzad Avari', 'Talmage Rogers'],
    industries: ['Manufacturing', 'Automotive', 'Aerospace & Defense', 'Energy', 'Chemicals', 'Utilities', 'Media/HT', 'Electronics', 'Telco']
  },
  FSS: {
    name: 'FSS',
    fullName: 'Financial Services',
    code: 'FSS',
    description: 'Financial Services sector',
    businessApplicationsLeader: 'Raj Katriyar',
    marketLeader: 'Glenn Finch',
    sapMarketLeader: 'Soumya Mishra',
    industries: ['Banking & Financial Markets', 'Insurance']
  },
  PUBLIC: {
    name: 'Public',
    code: 'PUBLIC',
    description: 'Public sector',
    businessApplicationsLeader: 'Stacy Hapgood',
    marketLeader: 'Myles Lynch',
    sapMarketLeader: 'Manoj Verma',
    industries: ['Life Sciences', 'Healthcare', 'State, Local & Education']
  },
  FEDERAL: {
    name: 'Federal',
    code: 'FEDERAL',
    description: 'Federal government sector',
    businessApplicationsLeader: 'Adam Jelic',
    marketLeader: 'Susan Wedge',
    sapMarketLeader: 'Tony Montana'
  },
  CANADA: {
    name: 'Canada',
    code: 'CANADA',
    description: 'Canadian market',
    businessApplicationsLeader: 'Roberto Bernabo',
    marketLeader: 'Rob Wilmot',
    sapMarketLeader: 'Armando Elias'
  },
  LATIN_AMERICA: {
    name: 'Latin America',
    code: 'LATAM',
    description: 'Latin America region',
    businessApplicationsLeader: 'Marisol Penante',
    marketLeader: 'Luis Padilha (Lufer)',
    sapMarketLeader: 'Elias Manuel Puente Robledo'
  }
}

// ============================================================================
// INDUSTRIES BY MARKET
// ============================================================================
export const INDUSTRIES_BY_MARKET = {
  // Distribution Market
  Distribution: {
    'CPG': {
      fullName: 'Consumer Packaged Goods',
      description: 'Consumer products and goods manufacturing',
      sapIndustryCode: 'CPG',
      leaders: {
        usIndustry: 'Paul Rakowski'
      }
    },
    'Retail': {
      fullName: 'Retail',
      description: 'Retail operations and omnichannel commerce',
      sapIndustryCode: 'Retail',
      leaders: {
        usIndustry: 'Joe Dittmar'
      }
    },
    'Travel & Transportation': {
      fullName: 'Travel & Transportation',
      description: 'Travel, logistics, and transportation services',
      sapIndustryCode: 'T&T',
      leaders: {
        usIndustry: 'Shannon Miller'
      }
    }
  },

  // Financial Services Market
  'Financial Services': {
    'Banking & Financial Markets': {
      fullName: 'Banking & Financial Markets',
      description: 'Banking, investment, and financial services',
      sapIndustryCode: 'Banking',
      leaders: {
        usIndustry: 'Gary Cole'
      }
    },
    'Insurance': {
      fullName: 'Insurance',
      description: 'Insurance operations and policy management',
      sapIndustryCode: 'Insurance',
      leaders: {
        usIndustry: 'Girish Ratnam'
      }
    }
  },

  // Industrial/Communications Market
  'Industrial/Communications': {
    'Manufacturing (Industrial Products)': {
      fullName: 'Industrial Products Manufacturing',
      description: 'Discrete and process manufacturing',
      sapIndustryCode: 'IND',
      leaders: {
        usIndustry: 'Ryan Coates'
      }
    },
    'Automotive': {
      fullName: 'Automotive',
      description: 'Automotive manufacturing and supply chain',
      sapIndustryCode: 'Auto',
      leaders: {
        usIndustry: 'Ryan Coates'
      }
    },
    'Aerospace & Defense': {
      fullName: 'Aerospace & Defense',
      description: 'Aerospace and defense manufacturing',
      sapIndustryCode: 'A&D',
      leaders: {
        usIndustry: 'Ryan Coates'
      }
    },
    'Energy (Oil & Gas)': {
      fullName: 'Oil & Gas',
      description: 'Oil, gas, and energy sector operations',
      sapIndustryCode: 'OGE',
      leaders: {
        usIndustry: 'Caroline Roche'
      }
    },
    'Chemicals': {
      fullName: 'Chemicals',
      description: 'Chemical manufacturing and processing',
      sapIndustryCode: 'Chem',
      leaders: {
        usIndustry: 'Caroline Roche'
      }
    },
    'Utilities': {
      fullName: 'Utilities',
      description: 'Utilities and energy distribution',
      sapIndustryCode: 'IS-U',
      leaders: {
        usIndustry: 'Caroline Roche'
      }
    },
    'Media & Entertainment': {
      fullName: 'Media & Entertainment',
      description: 'Media, entertainment, and content services',
      sapIndustryCode: 'M&E',
      leaders: {
        usIndustry: 'Lior Issacof'
      }
    },
    'High Tech (Electronics)': {
      fullName: 'High Tech & Electronics',
      description: 'High-tech and electronics manufacturing',
      sapIndustryCode: 'HT',
      leaders: {
        usIndustry: 'Lior Issacof'
      }
    },
    'Telecommunications': {
      fullName: 'Telecommunications',
      description: 'Telecom services and infrastructure',
      sapIndustryCode: 'Telco',
      leaders: {
        usIndustry: 'Dan Kusel'
      }
    }
  },

  // Public Sector Market
  Public: {
    'Life Sciences': {
      fullName: 'Life Sciences',
      description: 'Pharmaceutical and life sciences',
      sapIndustryCode: 'LS',
      leaders: {
        usIndustry: 'Manoj Kenkare'
      }
    },
    'Healthcare': {
      fullName: 'Healthcare',
      description: 'Healthcare providers and payers',
      sapIndustryCode: 'HCLS',
      leaders: {
        usIndustry: 'Scott Swanson'
      }
    },
    'State, Local & Education': {
      fullName: 'State, Local Government & Education',
      description: 'Public sector and education institutions',
      sapIndustryCode: 'PSCD',
      leaders: {
        usIndustry: 'Chris Shriver'
      }
    }
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get all industries as a flat list
 */
export function getAllIndustries() {
  const industries = []
  Object.values(INDUSTRIES_BY_MARKET).forEach(marketIndustries => {
    Object.entries(marketIndustries).forEach(([key, industry]) => {
      industries.push({
        code: key,
        ...industry
      })
    })
  })
  return industries
}

/**
 * Get market names
 */
export function getMarketNames() {
  return Object.values(AMERICAS_MARKETS).map(market => market.name)
}
