"""
Deal Data Structure and Validation
Defines the complete deal model with all financials, resources, and approval workflows
"""

# Activity Categories and Structure
ACTIVITY_CATEGORIES = {
    'service_area_approvals': {
        'name': 'Service Area Lead (SAL) & Process Area Lead (PAL) Approvals',
        'description': 'Paired SAL/PAL reviews for each service area',
        'activities': [
            {'id': 'rtr_sal', 'name': 'RTR - Service Area Lead (SAL) Approval', 'owner_type': 'SAL', 'area': 'RTR'},
            {'id': 'rtr_pal', 'name': 'RTR - Process Area Lead (PAL) Approval', 'owner_type': 'PAL', 'area': 'RTR'},
            {'id': 'otc_sal', 'name': 'OTC - Service Area Lead (SAL) Approval', 'owner_type': 'SAL', 'area': 'OTC'},
            {'id': 'otc_pal', 'name': 'OTC - Process Area Lead (PAL) Approval', 'owner_type': 'PAL', 'area': 'OTC'},
            {'id': 'ptp_ariba_sal', 'name': 'PTP/Ariba - Service Area Lead (SAL) Approval', 'owner_type': 'SAL', 'area': 'PTP/Ariba'},
            {'id': 'ptp_ariba_pal', 'name': 'PTP/Ariba - Process Area Lead (PAL) Approval', 'owner_type': 'PAL', 'area': 'PTP/Ariba'},
            {'id': 'ftpl_sal', 'name': 'FTP&L - Service Area Lead (SAL) Approval', 'owner_type': 'SAL', 'area': 'FTP&L'},
            {'id': 'ftpl_pal', 'name': 'FTP&L - Process Area Lead (PAL) Approval', 'owner_type': 'PAL', 'area': 'FTP&L'},
            {'id': 'data_sal', 'name': 'Data - Service Area Lead (SAL) Approval', 'owner_type': 'SAL', 'area': 'Data'},
            {'id': 'data_pal', 'name': 'Data - Process Area Lead (PAL) Approval', 'owner_type': 'PAL', 'area': 'Data'},
            {'id': 'analytics_sal', 'name': 'Analytics - Service Area Lead (SAL) Approval', 'owner_type': 'SAL', 'area': 'Analytics'},
            {'id': 'analytics_pal', 'name': 'Analytics - Process Area Lead (PAL) Approval', 'owner_type': 'PAL', 'area': 'Analytics'},
            {'id': 'ibp_sal', 'name': 'IBP - Service Area Lead (SAL) Approval', 'owner_type': 'SAL', 'area': 'IBP'},
            {'id': 'ibp_pal', 'name': 'IBP - Process Area Lead (PAL) Approval', 'owner_type': 'PAL', 'area': 'IBP'},
            {'id': 'security_sal', 'name': 'Security - Service Area Lead (SAL) Approval', 'owner_type': 'SAL', 'area': 'Security'},
            {'id': 'security_pal', 'name': 'Security - Process Area Lead (PAL) Approval', 'owner_type': 'PAL', 'area': 'Security'},
            {'id': 'ocm_sal', 'name': 'OCM - Service Area Lead (SAL) Approval', 'owner_type': 'SAL', 'area': 'OCM'},
            {'id': 'ocm_pal', 'name': 'OCM - Process Area Lead (PAL) Approval', 'owner_type': 'PAL', 'area': 'OCM'},
            {'id': 'epl_sal', 'name': 'EPL - Service Area Lead (SAL) Approval', 'owner_type': 'SAL', 'area': 'EPL'},
            {'id': 'epl_pal', 'name': 'EPL - Process Area Lead (PAL) Approval', 'owner_type': 'PAL', 'area': 'EPL'},
            {'id': 'group_reporting_sal', 'name': 'Group Reporting - Service Area Lead (SAL) Approval', 'owner_type': 'SAL', 'area': 'Group Reporting'},
            {'id': 'group_reporting_pal', 'name': 'Group Reporting - Process Area Lead (PAL) Approval', 'owner_type': 'PAL', 'area': 'Group Reporting'},
            {'id': 'sac_sal', 'name': 'SAC - Service Area Lead (SAL) Approval', 'owner_type': 'SAL', 'area': 'SAC'},
            {'id': 'sac_pal', 'name': 'SAC - Process Area Lead (PAL) Approval', 'owner_type': 'PAL', 'area': 'SAC'},
        ]
    },
    'staffing_approvals': {
        'name': 'Staffing Approvals',
        'description': 'Resource availability and staffing confirmations',
        'activities': [
            {'id': 'us_staffability', 'name': 'US Onsite Staffability Approval (SLDL)', 'owner_type': 'Staffing Lead'},
            {'id': 'india_staffability', 'name': 'India Offshore Staffability Approval', 'owner_type': 'Staffing Lead'},
            {'id': 'br_staffability', 'name': 'Baton Rouge CIC Staffability Approval', 'owner_type': 'Staffing Lead'},
            {'id': 'halifax_staffability', 'name': 'Halifax CIC Staffability Approval', 'owner_type': 'Staffing Lead'},
            {'id': 'sra_pmp', 'name': 'Staffing Risk Assessment (SRA) & PMP Creation', 'owner_type': 'Program Manager'},
        ]
    },
    'specialist_approvals': {
        'name': 'Specialist Approvals',
        'description': 'Technical and specialist review approvals',
        'activities': [
            {'id': 'risk', 'name': 'Risk Review Approval', 'required_if': 'tcv > 2000000', 'owner_type': 'Risk Manager'},
            {'id': 'tda', 'name': 'Technical Delivery Assessment (TDA) Approval', 'required_if': 'tcv > 10000000', 'owner_type': 'Technical Architect'},
            {'id': 'gfc', 'name': 'Global Facilitation Center (GFC) Approval', 'required_if': 'cross_border', 'owner_type': 'GFC Lead'},
            {'id': 'global_solutioning', 'name': 'Global Solutioning Review Approval', 'required_if': 'tcv >= 5000000', 'owner_type': 'Solution Architect'},
            {'id': 'itr', 'name': 'ITR Review Approval', 'required_if': 'custom', 'owner_type': 'ITR Reviewer'},
            {'id': 'impact', 'name': 'IMPACT Review Approval', 'required_if': 'uses_impact', 'owner_type': 'IMPACT Lead'},
            {'id': 'industry_lead', 'name': 'Industry Lead PRR Review Approval', 'required_if': 'always', 'owner_type': 'Industry Lead'},
            {'id': 'pricer', 'name': 'Pricer Review Approval', 'required_if': 'tcv >= 15000000 or holdback > 10%', 'owner_type': 'Pricing Specialist'},
            {'id': 'peer_review', 'name': 'Peer Review Approval', 'required_if': 'tcv <= 5000000', 'owner_type': 'Peer Reviewer'},
        ]
    },
    'compliance': {
        'name': 'Compliance & Documentation',
        'description': 'Required compliance checks and documentation',
        'activities': [
            {'id': 'dca', 'name': 'Deal Commitment Approval (DCA)', 'required_if': 'always', 'owner_type': 'Deal Manager'},
            {'id': 'dprc', 'name': 'Data Protection & Regulatory Compliance (DPRC)', 'required_if': 'always', 'owner_type': 'Compliance Officer'},
            {'id': 'credit_check', 'name': 'Credit Check', 'required_if': 'always', 'owner_type': 'Finance'},
            {'id': 'cseg', 'name': 'Client Services Evaluation Guide (CSEG)', 'required_if': 'always', 'owner_type': 'Service Evaluator'},
            {'id': 'rbk', 'name': 'Release Builder Kit (RBK)', 'required_if': 'always', 'owner_type': 'Release Manager'},
            {'id': 'dra', 'name': 'Deal Risk Assessment (DRA)', 'required_if': 'always', 'owner_type': 'Risk Assessor'},
        ]
    },
    'formal_gates': {
        'name': 'Formal Review Gates',
        'description': 'Sequential approval gates required for deal progression',
        'dependencies': ['service_area_approvals', 'specialist_approvals', 'compliance'],
        'activities': [
            {'id': 'wsa', 'name': 'Win Strategy Alignment (WSA)', 'required_if': 'rfp and tcv > 5000000', 'owner_type': 'Strategy Lead'},
            {'id': 'market_srr', 'name': 'Market SRR', 'required_if': 'always', 'depends_on': ['service_area_approvals'], 'owner_type': 'Market Leader'},
            {'id': 'americas_srr', 'name': 'Americas SRR', 'required_if': 'criteria', 'depends_on': ['market_srr'], 'owner_type': 'Americas Leader'},
            {'id': 'market_prr', 'name': 'Market PRR', 'required_if': 'always', 'depends_on': ['market_srr'], 'owner_type': 'Market Leader'},
            {'id': 'americas_prr', 'name': 'Americas PRR', 'required_if': 'criteria', 'depends_on': ['market_prr'], 'owner_type': 'Americas Leader'},
        ]
    }
}

# Key Resources Structure
KEY_RESOURCES = {
    'leadership': [
        {'role': 'Delivery Partner', 'required': True},
        {'role': 'Program Manager', 'required': True},
        {'role': 'Response Lead', 'required': True},
    ],
    'process_leads': [
        {'role': 'RTR Lead', 'sal': 'RTR'},
        {'role': 'OTC Lead', 'sal': 'OTC'},
        {'role': 'PTP Lead', 'sal': 'PTP'},
        {'role': 'FTP&L Lead', 'sal': 'FTP&L'},
        {'role': 'Data Lead', 'sal': 'Data'},
        {'role': 'Analytics Lead', 'sal': 'Analytics'},
    ],
    'specialists': [
        {'role': 'Technical Architect', 'required': False},
        {'role': 'Integration Lead', 'required': False},
        {'role': 'Testing Lead', 'required': True},
    ]
}
