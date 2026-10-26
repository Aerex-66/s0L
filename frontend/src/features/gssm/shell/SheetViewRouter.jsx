/**
 * SheetViewRouter — renders the correct view for the active sheet
 * (form view per sheet family, AG Grid, timeline, or pivots).
 *
 * s0L-only shell component — NOT part of the standalone sync boundary.
 * The sheet views themselves live in ../sheets/ (shared with standalone).
 *
 * NOTE on refs: the GSSM engine stores workbook data in mutable refs and
 * drives re-renders via rowData / metricsVersion state (established
 * engine-wide pattern, same as the pre-split GssmModule). Reading
 * workbookDataRef/generatedSheetsRef during render is intentional here.
 */
/* eslint-disable react-hooks/refs */
import { AgGridReact } from 'ag-grid-react'

import HomeSheetView from '../sheets/HomeSheetView'
import BidMetricsSheetView from '../sheets/BidMetricsSheetView'
import RatesSheetView from '../sheets/RatesSheetView'
import ForexSheetView from '../sheets/ForexSheetView'
import CloudSheetView from '../sheets/CloudSheetView'
import InflationSheetView from '../sheets/InflationSheetView'
import EffortMatrixSheetView from '../sheets/EffortMatrixSheetView'
import ImpTimelineView from '../sheets/ImpTimelineView'
import PMPTemplateSheetView from '../sheets/PMPTemplateSheetView'
import PTISheetView from '../sheets/PTISheetView'
import JRSSheetView from '../sheets/JRSSheetView'
import StaffingSheetView from '../sheets/StaffingSheetView'
import PivotSheetView from '../sheets/PivotSheetView'
import GeneratedSheetView from '../sheets/GeneratedSheetView'
import GPESheetView from '../sheets/GPESheetView'
import DataTableSheetView from '../sheets/DataTableSheetView'
import ReferenceSheetView from '../sheets/ReferenceSheetView'
import SummarySheetView from '../sheets/SummarySheetView'
import ChangeLogSheetView from '../sheets/ChangeLogSheetView'
import FSEstimationSheetView from '../sheets/FSEstimationSheetView'
import RICEFWEstimationSheetView from '../sheets/RICEFWEstimationSheetView'

import { getSheetDisplayName } from '../utils/normalizer'
import {
  GPE_SHEETS, SUMMARY_SHEETS, DATA_TABLE_SHEETS, REFERENCE_SHEETS, LOG_SHEETS,
} from './sheetGroups'

const EMPTY_ARRAY = []

export default function SheetViewRouter({
  activeSheet,
  gssmViewMode,
  isSolutioner,
  rowData,
  columnDefs,
  defaultColDef,
  getRowId,
  gridApiRef,
  onSelectionChanged,
  onCellEdit,
  workbookDataRef,
  generatedSheetsRef,
  deletedRowsRef,
  activeFormulas,
  onOpportunityChange,
  onAddStaffingRow,
  onRemoveStaffingRow,
  onSwapStaffingRows,
}) {
  const isGeneratedSheet = !!generatedSheetsRef.current[activeSheet]

  if (activeSheet === 'Imp TL') {
    return <ImpTimelineView rowData={rowData} onCellEdit={onCellEdit} />
  }

  if (gssmViewMode === 'form') {
    if (isGeneratedSheet) return <GeneratedSheetView gridData={generatedSheetsRef.current[activeSheet]} />
    if (activeSheet === 'Home') return <HomeSheetView rowData={rowData} onCellEdit={onCellEdit} onOpportunityChange={onOpportunityChange} isSolutioner={isSolutioner} />
    if (activeSheet === 'PTI_Estimator') return <PTISheetView rowData={rowData} onCellEdit={onCellEdit} isSolutioner={isSolutioner} />
    if (activeSheet === 'Bid Metrics') return <BidMetricsSheetView rowData={rowData} onCellEdit={onCellEdit} isSolutioner={isSolutioner} />
    if (activeSheet === 'Rates') return <RatesSheetView rowData={rowData} onCellEdit={onCellEdit} isSolutioner={isSolutioner} />
    if (activeSheet === 'Forex') return <ForexSheetView rowData={rowData} onCellEdit={onCellEdit} isSolutioner={isSolutioner} />
    if (activeSheet === 'Cloud') return <CloudSheetView rowData={rowData} onCellEdit={onCellEdit} isSolutioner={isSolutioner} />
    if (activeSheet === 'Inflation') return <InflationSheetView rowData={rowData} onCellEdit={onCellEdit} isSolutioner={isSolutioner} />
    if (activeSheet === 'Effort Matrix') return <EffortMatrixSheetView rowData={rowData} onCellEdit={onCellEdit} isSolutioner={isSolutioner} />
    if (activeSheet === 'PMP Template') return <PMPTemplateSheetView rowData={rowData} onCellEdit={onCellEdit} isSolutioner={isSolutioner} />
    if (activeSheet === 'JRS') return <JRSSheetView rowData={rowData} isSolutioner={isSolutioner} />
    if (activeSheet === 'Staffing') {
      return (
        <StaffingSheetView
          rowData={rowData}
          onCellEdit={onCellEdit}
          onAddRow={onAddStaffingRow}
          onRemoveRow={onRemoveStaffingRow}
          onSwapRows={onSwapStaffingRows}
          deletedRows={deletedRowsRef.current['Staffing']}
          validations={workbookDataRef.current?.validationsBySheet?.['Staffing'] || EMPTY_ARRAY}
          impTlRowData={workbookDataRef.current?.rowDataBySheet?.['Imp TL']}
          isSolutioner={isSolutioner}
        />
      )
    }
    if (activeSheet === 'FS Estimation') return <FSEstimationSheetView rowData={rowData} onCellEdit={onCellEdit} formulas={activeFormulas} isSolutioner={isSolutioner} />
    if (activeSheet === 'RICEFW Estimation') return <RICEFWEstimationSheetView rowData={rowData} onCellEdit={onCellEdit} formulas={activeFormulas} sheetName={activeSheet} isSolutioner={isSolutioner} />
    if (GPE_SHEETS.has(activeSheet)) return <GPESheetView rowData={rowData} onCellEdit={onCellEdit} formulas={activeFormulas} sheetName={activeSheet} isSolutioner={isSolutioner} />
    if (SUMMARY_SHEETS.has(activeSheet)) return <SummarySheetView rowData={rowData} sheetName={activeSheet} />
    if (DATA_TABLE_SHEETS.has(activeSheet)) return <DataTableSheetView rowData={rowData} onCellEdit={onCellEdit} formulas={activeFormulas} sheetName={activeSheet} isSolutioner={isSolutioner} />
    if (REFERENCE_SHEETS.has(activeSheet)) return <ReferenceSheetView rowData={rowData} sheetName={activeSheet} />
    if (LOG_SHEETS.has(activeSheet)) return <ChangeLogSheetView rowData={rowData} sheetName={activeSheet} />
    return <div className="gssm-unmapped"><p><strong>No form view for this sheet.</strong></p><p>Switch to Grid mode to view and edit.</p></div>
  }

  if (gssmViewMode === 'grid') {
    return (
      <div className="gssm-grid-panel">
        <h2 className="gssm-grid-title">{getSheetDisplayName(activeSheet)}</h2>
        <div className="gssm-grid-shell ag-theme-alpine">
          <AgGridReact
            rowData={rowData}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            getRowId={getRowId}
            onGridReady={params => { gridApiRef.current = params.api }}
            onCellFocused={onSelectionChanged}
            stopEditingWhenCellsLoseFocus
            suppressRowClickSelection
            enableCellTextSelection
          />
        </div>
      </div>
    )
  }

  if (gssmViewMode === 'pivot') {
    return <PivotSheetView staffingRowData={workbookDataRef.current?.rowDataBySheet?.['Staffing'] || []} />
  }

  return <div className="gssm-unmapped"><p><strong>Unknown view mode.</strong></p></div>
}
