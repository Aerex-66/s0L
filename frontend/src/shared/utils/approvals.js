/** SAL sign-offs are optional (never a gate) and PAL is gone: neither counts towards a deal's approvals. */
export const isOptionalApproval = (activity) => activity?.owner_type === 'SAL' || activity?.owner_type === 'PAL'

export const requiredApprovals = (activities) => (activities || []).filter((activity) => !isOptionalApproval(activity))
