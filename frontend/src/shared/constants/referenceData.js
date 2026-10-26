/**
 * Reference data for deal forms (dropdown options), plus the required-field
 * lists derived from the field index (shared/field_index.json).
 */
import dealConstants from './deal_constants.json'
import { INDUSTRIES_BY_MARKET, AMERICAS_MARKETS, getAllIndustries, getMarketNames } from './marketsIndustries'
import { fieldsWhere } from './fieldIndex'

const requiredOfType = (type) => fieldsWhere((field) => field.required && field.type === type).map(([key]) => key)

export const REQUIRED_TEXT_FIELDS = requiredOfType('text')
export const REQUIRED_REFERENCE_FIELDS = requiredOfType('select')

export const isRequiredTextField = (fieldName) => REQUIRED_TEXT_FIELDS.includes(fieldName)
export const isRequiredReferenceField = (fieldName) => REQUIRED_REFERENCE_FIELDS.includes(fieldName)

export const getImplementationTypes = () => dealConstants.implementation_types
export const getDealTypes = () => dealConstants.deal_types
export const getSectors = () => dealConstants.sectors
export const getMarkets = () => getMarketNames()

const uniqueSortedIndustryNames = () => getAllIndustries()
  .map((industry) => industry.fullName || industry.code)
  .filter(Boolean)
  .filter((value, index, array) => array.indexOf(value) === index)
  .sort((left, right) => left.localeCompare(right))

export function getIndustriesForMarket(marketName) {
  if (!marketName) return []
  const mappedIndustries = INDUSTRIES_BY_MARKET[marketName]
  if (mappedIndustries && Object.keys(mappedIndustries).length > 0) {
    return Object.keys(mappedIndustries)
  }
  const selectedMarket = Object.values(AMERICAS_MARKETS).find((market) => market.name === marketName)
  if (selectedMarket?.industries?.length) {
    return selectedMarket.industries
  }
  return uniqueSortedIndustryNames()
}

export const getAllIndustryNames = () => uniqueSortedIndustryNames()
