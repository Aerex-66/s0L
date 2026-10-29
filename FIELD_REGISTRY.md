# s0L Field Registry

> Generated from [shared/field_index.json](shared/field_index.json) by `npm run registry`. Do not edit by hand — edit the index and regenerate.

Every field that crosses a module or runtime boundary is declared once in the index. **Owner** decides who may write it:

- **deal** — Entered in s0L (Home, Deal Details, wizard, iSBD). Stored on the deal.
- **gssm** — Produced by the GSSM workbook and stored verbatim. Written only by PUT /api/deals/:id/gssm-sync.
- **monday** — Produced by the monday.com deal board and stored as the board has it. Stored only by core/features/integrations/monday/writer.py: by the board sync, after a TT Exec changes a column marked 's0L writes' on the board (a name the column already has, each change confirmed), and when the New Deal form adds a row (stored as monday answers).
- **salesforce** — Produced by IBM's Salesforce (IBM Sales Cloud) and stored as Salesforce has it. Stored only by core/features/integrations/salesforce/writer.py, by the Salesforce check of the deals on the monday board. A field that is deal-editable stays editable in s0L until Salesforce supplies a value for it; a blank in Salesforce never overwrites one.
- **isbd** — iSBD-only content, stored under deal.isbd_data.
- **derived** — Computed from other fields. Never stored; read-only everywhere.
- **system** — Set by the server.

237 fields in 24 sections. Old names are aliases: any of them resolves to the key on write, and the load-time migration renames stored data.

## identity

| Key | Label | Owner | Stored at / source | GSSM cell | monday column | Salesforce field | iSBD labels | Old names |
|---|---|---|---|---|---|---|---|---|
| `opportunity_number` | Opportunity Number | monday (deal-editable until linked) | `opportunity_number` | `Home!J22` | Name (`name`) | — | Opportunity Number, Opportunity No | siebel_number, opportunity_id, opportunity_no |
| `client_name` | Client Name | monday (deal-editable until linked) | `client_name` | `Home!J20` | Client (`dropdown_mkqy4mkc`) | — | Client Name, Client *(risk_assessment)* | — |
| `project_name` | Project Name | monday (deal-editable until linked) | `project_name` | `Home!J21` | Opportunity Description (`text_mkqypdsv`) | — | Opportunity Name | opportunity_name |
| `sector` | Sector | monday (deal-editable until linked) | `sector` | `Home!J16` | Sector (`dropdown_mksmcb`) | — | — | — |
| `industry` | Industry | monday (deal-editable until linked) | `industry` | — | Industry (`dropdown_mksmkbj8`) | — | — | — |
| `market` | Market | deal | `market` | — | — | — | — | — |
| `implementation_type` | Implementation Type | monday (deal-editable until linked) | `implementation_type` | — | Implementation Type (`color_mkqyaeva`) | — | — | — |
| `deal_type` | Deal Type | monday (deal-editable until linked) | `deal_type` | — | Deal Type (`text_mkxcyckc`) | — | — | — |
| `status` | Status | monday (deal-editable until linked) | `status` | — | Status (`color_mkqypejx`) | — | — | — |
| `service_line` | Service Line | deal | `service_line` | `Home!J18` | — | — | Lead Service Line / Offering | service_lines, lead_service_line_offering |
| `opportunity_owner` | Opportunity Owner | salesforce (deal-editable until Salesforce supplies it) | `opportunity_owner` | — | — | `Owner.Name` | Opportunity Owner, Opportunity Owner Name | opportunity_owner_name, response_lead |
| `account_classification` | Account Classification | deal | `account_classification` | — | — | — | Account Classification | — |
| `opportunity_type` | Opportunity Type | deal | `opportunity_type` | — | — | — | Opportunity Type | — |
| `currency` | Currency | monday (deal-editable until linked) | `currency` | — | Currency (`color_mkqyhjk0`) | — | — | — |

## classification

| Key | Label | Owner | Stored at / source | GSSM cell | monday column | Salesforce field | iSBD labels | Old names |
|---|---|---|---|---|---|---|---|---|
| `client_type` | Client Type | deal | `client_type` | — | — | — | Client *(executive_summary)* | exec_client_type |
| `engagement_type` | Engagement Type | deal | `engagement_type` | — | — | — | Engagement Type | exec_engagement_type |
| `engagement_source` | Engagement Source | deal | `engagement_source` | — | — | — | Engagement Source | exec_engagement_source |
| `review_status` | Review Status | deal | `review_status` | — | — | — | Review Status | — |
| `sap_applications` | SAP Applications | deal | `sap_applications` | — | — | — | — | — |

## dates

| Key | Label | Owner | Stored at / source | GSSM cell | monday column | Salesforce field | iSBD labels | Old names |
|---|---|---|---|---|---|---|---|---|
| `project_start_date` | Project Start Date | monday (deal-editable until linked) | `project_start_date` | — | Date (`timerange_mksghf1v`, from) | — | — | — |
| `rfp_submission_date` | RFP Submission Date | deal | `rfp_submission_date` | — | — | — | RFP or Request Date | rfp_request_date, rfp_date, rfp_or_request_date |
| `decision_date` | Decision Date | deal | `decision_date` | — | — | — | Decision Date | — |

## commercial

| Key | Label | Owner | Stored at / source | GSSM cell | monday column | Salesforce field | iSBD labels | Old names |
|---|---|---|---|---|---|---|---|---|
| `estimated_value` | Estimated Value | monday (deal-editable until linked) | `estimated_value` | `Home!J23` | TCV ($M) (`numeric_mkqyh0mz`) | — | — | approximate_tcv |
| `price_to_win` | Price to Win | deal | `price_to_win` | — | — | — | Expected Win Price | expected_win_price |
| `rate_card` | Rate Card | deal | `rate_card` | — | — | — | — | — |

## financials

| Key | Label | Owner | Stored at / source | GSSM cell | monday column | Salesforce field | iSBD labels | Old names |
|---|---|---|---|---|---|---|---|---|
| `service_line_target` | Service Line GP Target % | deal | `financials.service_line_target` | — | — | — | — | — |
| `services_revenue` | Services Revenue | gssm | `financials.services_revenue` | `PTI_Estimator!B30` | — | — | — | revenue |
| `labor_cost` | Labor Cost | gssm | `financials.labor_cost` | `PTI_Estimator!B31` | — | — | — | — |
| `pmr_cost` | PMR Cost | gssm | `financials.pmr_cost` | `PTI_Estimator!B32` | — | — | — | — |
| `tvm_cost` | TVM Cost | gssm | `financials.tvm_cost` | `PTI_Estimator!B33` | — | — | — | — |
| `total_cost` | Total Cost | gssm | `financials.total_cost` | `PTI_Estimator!B34` | — | — | — | — |
| `gp_amount` | GP | gssm | `financials.gp_amount` | `PTI_Estimator!B35` | — | — | — | gp |
| `gp_percent` | GP % | gssm | `financials.gp_percent` | `PTI_Estimator!B36` | — | — | — | — |
| `rev_app_percent` | Rev App % | gssm | `financials.rev_app_percent` | `PTI_Estimator!B37` | — | — | — | — |
| `rev_app` | Rev App | gssm | `financials.rev_app` | `PTI_Estimator!B38` | — | — | — | — |
| `pti` | PTI | gssm | `financials.pti` | `PTI_Estimator!B39` | — | — | — | — |
| `pti_percent` | PTI % | gssm | `financials.pti_percent` | `PTI_Estimator!B40` | — | — | — | — |
| `tcv` | TCV | gssm | `financials.tcv` | — | — | — | TCV / NPV GP%, TCV | tcv_npv_gp%, tcv_npv_gp |
| `contract_holder` | Contract Holder | gssm | `financials.contract_holder` | `PTI_Estimator!B14` | — | — | — | — |
| `risk_rating` | Risk Rating (0-9) | gssm | `financials.risk_rating` | `PTI_Estimator!B15` | — | — | — | risk_level |
| `days_to_pay` | Days to Pay | gssm | `financials.days_to_pay` | `PTI_Estimator!B16` | — | — | — | — |
| `desired_pti_percent` | Desired PTI % | gssm | `financials.desired_pti_percent` | `PTI_Estimator!B17` | — | — | — | — |
| `cola_clause` | COLA Clause | gssm | `financials.cola_clause` | `PTI_Estimator!B18` | — | — | — | — |
| `gbs_bid_type` | GBS Bid Type | gssm | `financials.gbs_bid_type` | `PTI_Estimator!B19` | — | — | — | — |
| `total_contingency` | Total Contingency | gssm | `financials.total_contingency` | `PTI_Estimator!B23` | — | — | — | contingency_percent |
| `contract_type` | Contract Type | gssm | `financials.contract_type` | `PTI_Estimator!B41` | — | — | Pricing Structure, Contract Type *(risk_assessment)* | price_model, pricing_structure |
| `price_type` | Price Type | gssm | `financials.price_type` | `PTI_Estimator!B42` | — | — | Price Type, Submission Type *(staffing_approvals)* | pricing_type, submission_type |
| `consider_non_labor` | Non-Labor Cost | gssm | `financials.consider_non_labor` | `PTI_Estimator!B43` | — | — | — | — |
| `pre_approved_rates` | Pre-Approved Rates | gssm | `financials.pre_approved_rates` | `PTI_Estimator!B44` | — | — | — | — |

## gssm_outputs

| Key | Label | Owner | Stored at / source | GSSM cell | monday column | Salesforce field | iSBD labels | Old names |
|---|---|---|---|---|---|---|---|---|
| `timelines` | Implementation Timelines | gssm (deal-editable until linked) | `timelines` | `Imp TL!A16` | — | — | — | — |
| `staffing` | Staffing Summary | gssm | `staffing` | — | — | — | — | — |
| `bid_metrics` | Bid Metrics | gssm | `bid_metrics` | — | — | — | — | — |
| `gssm_ricefw` | RICEFW Summary | gssm | `gssm_ricefw` | — | — | — | — | — |
| `gssm_synced_at` | Last GSSM Sync | gssm | `gssm_synced_at` | — | — | — | — | — |
| `gssm_workbook_id` | Linked GSSM Workbook | gssm | `gssm_workbook_id` | — | — | — | — | — |

## workflow

| Key | Label | Owner | Stored at / source | GSSM cell | monday column | Salesforce field | iSBD labels | Old names |
|---|---|---|---|---|---|---|---|---|
| `activities` | Approvals | deal | `activities` | — | — | — | — | — |
| `workflow_stage_manual` | Manually Completed Stages | deal | `workflow_stage_manual` | — | — | — | — | — |
| `manual_enabled_areas` | Manually Enabled Service Areas | deal | `manual_enabled_areas` | — | — | — | — | — |

## people

| Key | Label | Owner | Stored at / source | GSSM cell | monday column | Salesforce field | iSBD labels | Old names |
|---|---|---|---|---|---|---|---|---|
| `contacts` | Contacts | deal | `contacts` | — | — | — | — | — |
| `resources` | Key Resources | deal | `resources` | — | — | — | — | — |
| `lead_ssc` | Lead SSC | monday (deal-editable until linked) | `lead_ssc` | — | Lead SSC (`color_mkqyvgvy`) · s0L writes | — | — | — |
| `tt_executive` | TT Executive | monday (deal-editable until linked) | `tt_executive` | — | TT Exec (`color_mkqy18z3`) · s0L writes | — | — | — |
| `solution_consultant_2` | Solution Consultant 2 | monday (deal-editable until linked) | `solution_consultant_2` | — | SSC2 (`color_mksmhqb`) · s0L writes | — | — | — |
| `solution_consultant_3` | Solution Consultant 3 | monday (deal-editable until linked) | `solution_consultant_3` | — | SSC3 (`color_mksmnwx4`) · s0L writes | — | — | — |
| `solution_consultant_4` | Solution Consultant 4 | monday (deal-editable until linked) | `solution_consultant_4` | — | SSC4 (`color_mksmc3ry`) | — | — | — |

## links

| Key | Label | Owner | Stored at / source | GSSM cell | monday column | Salesforce field | iSBD labels | Old names |
|---|---|---|---|---|---|---|---|---|
| `gpe_url` | GPE | deal | `external_links.gpe_url` | — | — | — | — | — |
| `gssm_url` | GSSM | deal | `external_links.gssm_url` | — | — | — | — | — |
| `rbk_url` | RBK | deal | `external_links.rbk_url` | — | — | — | — | — |
| `dca_url` | DCA | deal | `external_links.dca_url` | — | — | — | — | — |
| `onedrive_url` | Deal Team Folder | deal | `external_links.onedrive_url` | — | — | — | — | — |
| `greenstar_url` | Greenstar | deal | `external_links.greenstar_url` | — | — | — | — | — |
| `swb_url` | SWB | deal | `external_links.swb_url` | — | — | — | — | — |
| `adtd_url` | ADTD | deal | `external_links.adtd_url` | — | — | — | — | — |
| `tiger_url` | Tiger Team | deal | `external_links.tiger_url` | — | — | — | — | — |
| `cloud_sync_path` | Cloud Sync Folder | deal | `cloud_sync_path` | — | — | — | — | — |

## system

| Key | Label | Owner | Stored at / source | GSSM cell | monday column | Salesforce field | iSBD labels | Old names |
|---|---|---|---|---|---|---|---|---|
| `id` | Deal ID | system | `id` | — | — | — | — | — |
| `created_date` | Created | system | `created_date` | — | — | — | — | — |
| `documents` | Documents | system | `documents` | — | — | — | — | — |

## monday

| Key | Label | Owner | Stored at / source | GSSM cell | monday column | Salesforce field | iSBD labels | Old names |
|---|---|---|---|---|---|---|---|---|
| `project_end_date` | Project End Date | monday (deal-editable until linked) | `project_end_date` | — | Date (`timerange_mksghf1v`, to) | — | — | — |
| `close_quarter` | Close Quarter | monday (deal-editable until linked) | `close_quarter` | — | Cls Qtr (`dropdown_mm25b4qb`) | — | — | — |
| `forecast_category` | Call / Upside | monday (deal-editable until linked) | `forecast_category` | — | Call / Upside (`dropdown_mm25d2jn`) | — | — | — |
| `lead_sl` | Lead SL | monday (deal-editable until linked) | `lead_sl` | — | Lead SL (`dropdown_mm25z11`) | — | — | — |
| `greenstar_dca_link` | Greenstar Estimate / DCA Link | monday (deal-editable until linked) | `greenstar_dca_link` | — | Greenstar Estimate/DCA Link (`text_mm408f48`) | — | — | — |
| `solutioning_pov` | Solutioning POV | monday (deal-editable until linked) | `solutioning_pov` | — | Solutioning POV Full (`long_text_mm25w1z6`) | — | — | — |
| `staffing_bp` | Staffing: B&P | monday (deal-editable until linked) | `staffing_bp` | — | B&P (`color_mm25ght2`) | — | — | — |
| `staffing_asset` | Staffing: Asset | monday (deal-editable until linked) | `staffing_asset` | — | Asset (`color_mm25598z`) | — | — | — |
| `staffing_associates` | Staffing: Associates | monday (deal-editable until linked) | `staffing_associates` | — | Associates (`color_mm25gn8v`) | — | — | — |
| `staffing_total_band` | Staffing: Total Band | monday (deal-editable until linked) | `staffing_total_band` | — | Total Band (`color_mm25eaym`) | — | — | — |
| `staffing_center_mix` | Staffing: Center Mix | monday (deal-editable until linked) | `staffing_center_mix` | — | Center Mix (`color_mm25hw08`) | — | — | — |
| `staffing_full` | Deal Staffing Full | monday (deal-editable until linked) | `staffing_full` | — | Deal Staffing Full (`color_mm2517e2`) | — | — | — |
| `monday_people` | monday People | monday | `monday_people` | — | People (`multiple_person_mksgb69d`) | — | — | — |
| `monday_people_1` | monday People 1 | monday | `monday_people_1` | — | People 1 (`multiple_person_mktm20zw`) | — | — | — |
| `monday_item_id` | monday Row | monday | `monday_item_id` | — | row id | — | — | — |
| `monday_group` | monday Group | monday | `monday_group` | — | row group | — | — | — |
| `monday_created_at` | Added to the monday Board | monday | `monday_created_at` | — | row created_at | — | — | — |
| `status_changed_at` | Status Changed | monday | `status_changed_at` | — | Status (`color_mkqypejx`, updated_at) | — | — | — |
| `monday_synced_at` | Last monday Sync | monday | `monday_synced_at` | — | — | — | — | — |
| `monday_missing_since` | Left the monday Board | monday | `monday_missing_since` | — | — | — | — | — |

## salesforce

| Key | Label | Owner | Stored at / source | GSSM cell | monday column | Salesforce field | iSBD labels | Old names |
|---|---|---|---|---|---|---|---|---|
| `salesforce_id` | Salesforce Opportunity | salesforce | `salesforce_id` | — | — | check id | — | — |
| `salesforce_lookup` | Salesforce Lookup | salesforce | `salesforce_lookup` | — | — | check lookup | — | — |
| `salesforce_checked_at` | Last Salesforce Check | salesforce | `salesforce_checked_at` | — | — | check checked at | — | — |
| `salesforce_supplied` | Filled From Salesforce | salesforce | `salesforce_supplied` | — | — | check supplied | — | — |
| `sf_name` | Salesforce Opportunity Name | salesforce | `sf_name` | — | — | `Name` | — | — |
| `sf_stage` | Salesforce Stage | salesforce | `sf_stage` | — | — | `StageName` | — | — |
| `sf_close_date` | Salesforce Close Date | salesforce | `sf_close_date` | — | — | `CloseDate` | — | — |
| `sf_amount` | Salesforce Amount | salesforce | `sf_amount` | — | — | `Amount` | — | — |
| `sf_currency` | Salesforce Currency | salesforce | `sf_currency` | — | — | `CurrencyIsoCode` | — | — |
| `sf_forecast_category` | Salesforce Forecast Category | salesforce | `sf_forecast_category` | — | — | `ForecastCategoryName` | — | — |
| `sf_account_name` | Salesforce Account | salesforce | `sf_account_name` | — | — | `Account.Name` | — | — |

## isbd_profile

| Key | Label | Owner | Stored at / source | GSSM cell | monday column | Salesforce field | iSBD labels | Old names |
|---|---|---|---|---|---|---|---|---|
| `geo_market` | GEO / Market / Industry | derived | computed: `geo_market` | — | — | — | GEO / Market / Industry, GEO / Market | geo_market_industry |
| `isbd_update_date` | iSBD Update Date | derived | computed: `current_date` | — | — | — | iSBD Update Date, iSBD Update Date As Of (DD/MM/YYYY) | isbd_update_date_as_of_dd_mm_yyyy |
| `work_effort` | Work Effort (hours) | derived | computed: `work_effort` | — | — | — | — | — |
| `onshore_offshore_pct` | Onshore / Offshore Mix | derived | computed: `onshore_offshore_pct` | — | — | — | — | — |
| `sales_stage` | Sales Stage | monday (deal-editable until linked) | `sales_stage` | — | Sales Stage (`dropdown_mm25w58s`) | — | Sales Stage | — |
| `swb_stage` | Solution WorkBench (SWB) Stage | monday (deal-editable until linked) | `swb_stage` | — | SWB Level (`dropdown_mm2513h7`) | — | Solution WorkBench (SWB) Stage | solution_workbench_swb_stage |
| `term` | Term | isbd | `isbd_data.term` | — | — | — | Term | — |
| `credit_rating` | Credit Rating | isbd | `isbd_data.credit_rating` | — | — | — | Credit Rating | — |
| `complex_opportunity` | Complex Opportunity? | isbd | `isbd_data.complex_opportunity` | — | — | — | Complex Opportunity? | — |

## isbd_dates

| Key | Label | Owner | Stored at / source | GSSM cell | monday column | Salesforce field | iSBD labels | Old names |
|---|---|---|---|---|---|---|---|---|
| `delivery_start` | Delivery Start Date | derived | computed: `delivery_start` | — | — | — | Delivery Start Date | delivery_start_date |
| `stormcast_status` | StormCast % / Date / Qualification Status | isbd | `isbd_data.stormcast_status` | — | — | — | StormCast % / Date / Qualification Status | stormcast_%_date_qualification_status, stormcast_date_qualification_status |
| `solution_release_date` | Solution Release Date | isbd | `isbd_data.solution_release_date` | — | — | — | Solution Release Date | — |
| `srr_date` | SRR Date(s) | isbd | `isbd_data.srr_date` | — | — | — | Solution Review (SRR) Date(s), SRR Date(s) | srr_date_s, solution_review_srr_date_s |
| `prr_date` | PRR Date(s) | isbd | `isbd_data.prr_date` | — | — | — | Price Review (PRR) Date(s), PRR Date(s), Pricing Release Review (PRR) Date | prr_date_s, price_review_prr_date_s, pricing_release_review_prr_date |
| `bid_submission_date` | Bid Submission Date | isbd | `isbd_data.bid_submission_date` | — | — | — | Bid Submission Date | bid_date |
| `expected_signature_date` | Expected Contract Signature Date | isbd | `isbd_data.expected_signature_date` | — | — | — | Expected Contract Signature Date | expected_contract_signature_date |

## isbd_risk

| Key | Label | Owner | Stored at / source | GSSM cell | monday column | Salesforce field | iSBD labels | Old names |
|---|---|---|---|---|---|---|---|---|
| `term_months` | Duration | derived | computed: `term_duration` | — | — | — | Duration *(risk_assessment)* | — |
| `total_resources` | # Resources | derived | computed: `total_resources` | — | — | — | # Resources | #_resources |
| `risk_review_date` | Risk Review Date | isbd | `isbd_data.risk_review_date` | — | — | — | Date *(risk_assessment)* | — |
| `offering_type` | Offering Type | isbd | `isbd_data.offering_type` | — | — | — | Offering Type | — |
| `ibm_se` | IBM SE | isbd | `isbd_data.ibm_se` | — | — | — | IBM SE | — |
| `risk_third_party` | 3rd Party | isbd | `isbd_data.risk_third_party` | — | — | — | 3rd Party *(risk_assessment)* | 3rd_party |

## isbd_team

| Key | Label | Owner | Stored at / source | GSSM cell | monday column | Salesforce field | iSBD labels | Old names |
|---|---|---|---|---|---|---|---|---|
| `partner_name` | Partner Name | derived | computed: `team_member` (Delivery Partner) | — | — | — | Partner Name, Lead Partner | lead_partner |
| `delivery_leader` | Delivery Leader | derived | computed: `team_member` (Delivery Partner) | — | — | — | Delivery Leader (responsible for delivery success), Delivery Leader / Partner, Delivery Leader | delivery_leader_partner, delivery_leader_responsible_for_delivery_success |
| `solution_consultant` | Senior Solution Consultant | derived | computed: `team_member` (Solution Architect) | — | — | — | Senior Solution Consultant, Senior Solution Consultant Name, Solution Lead | solution_lead, senior_solution_consultant_name, senior_solution_consultant |
| `solution_leader` | Solution Leader | derived | computed: `team_member` (Solution Architect) | — | — | — | Solution Leader | — |
| `risk_consultant` | Risk Consultant | derived | computed: `team_member` (Risk Consultant) | — | — | — | Risk Consultant | — |
| `quality_partner` | Quality Partner | derived | computed: `team_member` (Quality Partner) | — | — | — | Quality Partner (if rqd), Quality Partner | quality_partner_if_rqd |
| `program_manager` | Program Manager | derived | computed: `team_member` (Program Manager) | — | — | — | Program Mgr or Complex PM * | program_mgr_or_complex_pm |
| `lead_solution_architect` | Lead Solution Architect | isbd | `isbd_data.lead_solution_architect` | — | — | — | Lead Solution Architect | — |
| `tda_reviewer` | TDA Reviewer | isbd | `isbd_data.tda_reviewer` | — | — | — | TDA Reviewer, TDA SME Name *(tda)* | tda_sme_name |
| `itr_reviewer` | ITR Reviewer | isbd | `isbd_data.itr_reviewer` | — | — | — | ITR Reviewer | — |
| `legal_counsel` | Legal Counsel | isbd | `isbd_data.legal_counsel` | — | — | — | Legal Counsel | — |
| `pricer` | Pricer | isbd | `isbd_data.pricer` | — | — | — | Pricer | — |
| `delivery_architect` | Lead Delivery Architect | isbd | `isbd_data.delivery_architect` | — | — | — | Lead Delivery Architect | lead_delivery_architect |
| `solutioning_approver` | Solutioning Approver | isbd | `isbd_data.solutioning_approver` | — | — | — | Solutioning Approver ** | — |
| `service_line_approver` | Service Line Leader Approver | isbd | `isbd_data.service_line_approver` | — | — | — | Service Line Leader Approver ** | service_line_leader_approver |
| `project_manager` | Project Manager | isbd | `isbd_data.project_manager` | — | — | — | Project Manager | — |

## isbd_staffing

| Key | Label | Owner | Stored at / source | GSSM cell | monday column | Salesforce field | iSBD labels | Old names |
|---|---|---|---|---|---|---|---|---|
| `demand_in_pmp` | Demand in PMP | derived | from `resources.staffability.sra_pmp.status` | — | — | — | Demand in PMP | — |
| `staffability_review_date` | Staffability Review Date | isbd | `isbd_data.staffability_review_date` | — | — | — | Staffability Review Date | — |
| `staffability_expires` | Staffability Expires | isbd | `isbd_data.staffability_expires` | — | — | — | Staffability Expires | — |
| `rcm_assessment` | R&CM Assessment | isbd | `isbd_data.rcm_assessment` | — | — | — | R&CM Assessment | r_cm_assessment |

## isbd_contract

| Key | Label | Owner | Stored at / source | GSSM cell | monday column | Salesforce field | iSBD labels | Old names |
|---|---|---|---|---|---|---|---|---|
| `billing_payment_terms` | Billing / Payment Terms | isbd | `isbd_data.billing_payment_terms` | — | — | — | Billing / Payment Terms | billing_terms |
| `billing_timing` | Billing Timing | isbd | `isbd_data.billing_timing` | — | — | — | Billing Timing | — |
| `payment_terms` | Payment Terms | isbd | `isbd_data.payment_terms` | — | — | — | Payment Terms | — |
| `staff_augmentation` | Staff Augmentation? | isbd | `isbd_data.staff_augmentation` | — | — | — | Staff Augmentation? | — |
| `fx_protection` | FX Protection | isbd | `isbd_data.fx_protection` | — | — | — | FX Protection | — |
| `inflation` | Inflation | isbd | `isbd_data.inflation` | — | — | — | Inflation | — |
| `repricing_clause` | Re-Pricing Clause? | isbd | `isbd_data.repricing_clause` | — | — | — | Re-Pricing Clause? | re_pricing_clause |
| `penalties` | Penalties? | isbd | `isbd_data.penalties` | — | — | — | Penalties? | — |
| `tt_cost_amortized` | T/T Cost Amortized? | isbd | `isbd_data.tt_cost_amortized` | — | — | — | T/T Cost Amortized? | t_t_cost_amortized |
| `non_standard_tc` | Non Standard T&C? | isbd | `isbd_data.non_standard_tc` | — | — | — | Non Standard T&C? | non_standard_t_c |
| `non_standard_slas` | Non Standard SLAs? | isbd | `isbd_data.non_standard_slas` | — | — | — | Non Standard SLAs? | — |
| `performance_bond` | Performance Bond? | isbd | `isbd_data.performance_bond` | — | — | — | Performance Bond? | — |
| `subcontractor_value` | Third Parties / Subcontractor value included in TCV | isbd | `isbd_data.subcontractor_value` | — | — | — | Third Parties / Subcontractor value included in TCV | third_parties_subcontractor_value_included_in_tcv |
| `npv_gp_percent` | NPV GP % | isbd | `isbd_data.npv_gp_percent` | — | — | — | NPV GP% | npv_gp, npv_gp% |
| `target_win_price` | Target Win Price | isbd | `isbd_data.target_win_price` | — | — | — | Target Win Price | — |
| `price_methodology` | Methodology for Target Win Price | isbd | `isbd_data.price_methodology` | — | — | — | Methodology for Target Win Price | — |

## isbd_complexity

| Key | Label | Owner | Stored at / source | GSSM cell | monday column | Salesforce field | iSBD labels | Old names |
|---|---|---|---|---|---|---|---|---|
| `solutioned_to_standard` | Solutioned to Standard? | isbd | `isbd_data.solutioned_to_standard` | — | — | — | Solutioned to Standard? | — |
| `cic_offshore_resource_compliant` | CIC Offshore Resource Compliant | isbd | `isbd_data.cic_offshore_resource_compliant` | — | — | — | CIC Offshore Resource Compliant | — |
| `cic_offshore_band_compliant` | CIC Offshore Band Mix Compliant | isbd | `isbd_data.cic_offshore_band_compliant` | — | — | — | CIC Offshore Band Mix Compliant | cic_offshore_band_mix_compliant |
| `consortium_agreement` | Consortium Agreement | isbd | `isbd_data.consortium_agreement` | — | — | — | Consortium Agreement | — |
| `enhanced_risky_solution` | Enhanced Risky Solution Type? | isbd | `isbd_data.enhanced_risky_solution` | — | — | — | Enhanced Risky Solution Type? | enhanced_risky_solution_type |
| `rebadging_in_scope` | Client to IBM Re-badging in Scope? | isbd | `isbd_data.rebadging_in_scope` | — | — | — | Client to IBM Re-badging in Scope? | client_to_ibm_re_badging_in_scope |
| `pcw_in_place` | PCW in Place? | isbd | `isbd_data.pcw_in_place` | — | — | — | PCW in Place? | — |
| `capital_investment` | Capital, Investment, Cash Injection? | isbd | `isbd_data.capital_investment` | — | — | — | Capital, Investment, Cash Injection? | capital_investment_cash_injection |
| `dpa_applicable` | Data Privacy Assessment (DPA) Applicable? | isbd | `isbd_data.dpa_applicable` | — | — | — | Data Privacy Assessment (DPA) Applicable? | data_privacy_assessment_dpa_applicable |
| `regulated_client` | Regulated Client? | isbd | `isbd_data.regulated_client` | — | — | — | Regulated Client? | — |
| `foak` | FOAK? | isbd | `isbd_data.foak` | — | — | — | FOAK? | — |
| `agile_delivery` | Agile Delivery? | isbd | `isbd_data.agile_delivery` | — | — | — | Agile Delivery? | — |
| `cloud_hyperscaler` | Cloud? / Hyperscaler? | isbd | `isbd_data.cloud_hyperscaler` | — | — | — | Cloud? / Hyperscaler? | — |
| `genai_included` | GenAI | isbd | `isbd_data.genai_included` | — | — | — | GenAI | genai |
| `asset_tcv_percent` | Asset TCV % | isbd | `isbd_data.asset_tcv_percent` | — | — | — | Asset TCV% | asset_tcv%, asset_tcv |

## isbd_incumbent

| Key | Label | Owner | Stored at / source | GSSM cell | monday column | Salesforce field | iSBD labels | Old names |
|---|---|---|---|---|---|---|---|---|
| `incumbent_program_name` | Incumbent Program Name | isbd | `isbd_data.incumbent_program_name` | — | — | — | Program Name | program_name |
| `incumbent_contract_number` | Incumbent Contract Number | isbd | `isbd_data.incumbent_contract_number` | — | — | — | Contract Number | contract_number |
| `incumbent_contract_end_date` | Incumbent Contract End Date | isbd | `isbd_data.incumbent_contract_end_date` | — | — | — | Contract End Date | contract_end_date |
| `incumbent_provider` | Incumbent Provider | isbd | `isbd_data.incumbent_provider` | — | — | — | Incumbent Provider | — |
| `incumbent_annual_revenue` | Incumbent Annual Revenue | isbd | `isbd_data.incumbent_annual_revenue` | — | — | — | Annual Revenue | annual_revenue |

## isbd_consulting_lines

| Key | Label | Owner | Stored at / source | GSSM cell | monday column | Salesforce field | iSBD labels | Old names |
|---|---|---|---|---|---|---|---|---|
| `strategy_transformation` | Strategy & Transformation | isbd | `isbd_data.strategy_transformation` | — | — | — | — | — |
| `business_applications` | Business Applications | isbd | `isbd_data.business_applications` | — | — | — | — | — |
| `hybrid_cloud_data` | Hybrid Cloud & Data | isbd | `isbd_data.hybrid_cloud_data` | — | — | — | — | — |
| `business_operations` | Business Operations | isbd | `isbd_data.business_operations` | — | — | — | — | — |
| `application_operations` | Application Operations | isbd | `isbd_data.application_operations` | — | — | — | — | — |
| `cybersecurity` | Cybersecurity | isbd | `isbd_data.cybersecurity` | — | — | — | — | — |
| `technology` | Technology | isbd | `isbd_data.technology` | — | — | — | — | — |
| `cloud` | Cloud | isbd | `isbd_data.cloud` | — | — | — | — | — |
| `red_hat` | Red Hat | isbd | `isbd_data.red_hat` | — | — | — | — | — |
| `total_ibm_consulting` | Total IBM Consulting | isbd | `isbd_data.total_ibm_consulting` | — | — | — | — | — |
| `total_non_ibm_consulting` | Total Non IBM Consulting | isbd | `isbd_data.total_non_ibm_consulting` | — | — | — | — | — |
| `total` | Total | isbd | `isbd_data.total` | — | — | — | — | — |

## isbd_tda

| Key | Label | Owner | Stored at / source | GSSM cell | monday column | Salesforce field | iSBD labels | Old names |
|---|---|---|---|---|---|---|---|---|
| `tda_first_of_kind` | First-of-a-Kind? | isbd | `isbd_data.tda_first_of_kind` | — | — | — | First-of-a-Kind? | first_of_a_kind |
| `tda_complex_integration` | Complex System Integration? | isbd | `isbd_data.tda_complex_integration` | — | — | — | Complex System Integration? | complex_system_integration |
| `tda_cross_brand` | Cross-Brand Delivery? | isbd | `isbd_data.tda_cross_brand` | — | — | — | Cross-Brand Delivery? | cross_brand_delivery |
| `tda_project_delivery` | Project Delivery Complex? | isbd | `isbd_data.tda_project_delivery` | — | — | — | Project Delivery Complex? | project_delivery_complex |
| `tda_gdpr` | GDPR Reviewed? | isbd | `isbd_data.tda_gdpr` | — | — | — | GDPR Reviewed? | gdpr_reviewed |
| `tda_narrative` | TDA Summary Narrative | isbd | `isbd_data.tda_narrative` | — | — | — | TDA Summary Narrative | — |
| `tda_risk_rating` | TDA Risk Rating | isbd | `isbd_data.tda_risk_rating` | — | — | — | TDA Risk Rating | — |
| `tda_complexity_result` | TDA Complexity Assessment | isbd | `isbd_data.tda_complexity_result` | — | — | — | TDA Complexity Assessment | tda_complexity_assessment |

## isbd_narrative

| Key | Label | Owner | Stored at / source | GSSM cell | monday column | Salesforce field | iSBD labels | Old names |
|---|---|---|---|---|---|---|---|---|
| `client_ask_narrative` | What is the Client ask? | isbd | `isbd_data.client_ask_narrative` | — | — | — | What is the Client ask? | — |
| `win_theme` | Win Theme & Negotiation Strategy | isbd | `isbd_data.win_theme` | — | — | — | Win Theme & Negotiation Strategy | win_theme_negotiation_strategy |
| `value_proposition` | IBM Value Proposition | isbd | `isbd_data.value_proposition` | — | — | — | IBM Value Proposition | ibm_value_proposition |
| `solution_summary_narrative` | Solution Summary | isbd | `isbd_data.solution_summary_narrative` | — | — | — | Solution Summary | — |
| `financial_assumptions` | Financial Assumptions | isbd | computed: `financial_assumptions` | — | — | — | — | — |
| `key_changes_narrative` | Key Changes Narrative | isbd | `isbd_data.key_changes_narrative` | — | — | — | — | — |
| `timeline_adjustments_narrative` | Timeline Adjustments | isbd | `isbd_data.timeline_adjustments_narrative` | — | — | — | — | — |
| `wricef_notes` | WRICEF Notes | isbd | `isbd_data.wricef_notes` | — | — | — | — | — |
| `assumption_title` | Assumptions Title | isbd | `isbd_data.assumption_title` | — | — | — | — | — |
| `assumption_body` | Assumptions | isbd | `isbd_data.assumption_body` | — | — | — | — | — |
| `subcontractor_narrative` | Subcontractor Detail | isbd | `isbd_data.subcontractor_narrative` | — | — | — | — | — |
| `ocm_project_scope` | OCM Project Scope | isbd | `isbd_data.ocm_project_scope` | — | — | — | — | — |
| `ocm_staffing` | OCM Staffing | isbd | `isbd_data.ocm_staffing` | — | — | — | — | — |
| `key_deal_aspects_body` | Key Deal Aspects | isbd | `isbd_data.key_deal_aspects_body` | — | — | — | — | — |
| `deal_context_summary` | Deal Timeline Context | isbd | `isbd_data.deal_context_summary` | — | — | — | — | — |
| `srr_action_items_body` | SRR Action Items | isbd | `isbd_data.srr_action_items_body` | — | — | — | — | — |
| `solution_map_notes` | Solution Map Notes | isbd | `isbd_data.solution_map_notes` | — | — | — | — | — |
| `custom_dev_notes` | Custom Development Notes | isbd | `isbd_data.custom_dev_notes` | — | — | — | — | — |
| `interface_notes` | PI/PO Interface Notes | isbd | `isbd_data.interface_notes` | — | — | — | — | — |

## isbd_scope

| Key | Label | Owner | Stored at / source | GSSM cell | monday column | Salesforce field | iSBD labels | Old names |
|---|---|---|---|---|---|---|---|---|
| `scope_project_overview` | High Level Project Scope | isbd | `isbd_data.scope_project_overview` | — | — | — | — | — |
| `scope_business_process` | Business Process | isbd | `isbd_data.scope_business_process` | — | — | — | — | — |
| `scope_apps_ecosystem` | Applications | isbd | `isbd_data.scope_apps_ecosystem` | — | — | — | — | — |
| `scope_organization` | Organization | isbd | `isbd_data.scope_organization` | — | — | — | — | — |
| `scope_ocm_training` | OCM & Training | isbd | `isbd_data.scope_ocm_training` | — | — | — | — | — |
| `scope_custom_dev` | Development | isbd | `isbd_data.scope_custom_dev` | — | — | — | — | — |
| `scope_data_migration` | Data & Analytics | isbd | `isbd_data.scope_data_migration` | — | — | — | — | — |
| `scope_tech_infra` | Technology & Basis | isbd | `isbd_data.scope_tech_infra` | — | — | — | — | — |
| `scope_security` | User Roles & Security | isbd | `isbd_data.scope_security` | — | — | — | — | — |
| `scope_testing` | Testing | isbd | `isbd_data.scope_testing` | — | — | — | — | — |
| `scope_delivery` | Solution Construct / Delivery | isbd | `isbd_data.scope_delivery` | — | — | — | — | — |
