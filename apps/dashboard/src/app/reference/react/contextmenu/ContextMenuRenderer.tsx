import { ContextMenuItem, getApi, LABELS, RendererProps } from "@euxdt/grid-core";
import { FC } from "react";
import { createMenu } from "../adapter";

export const GridContextMenu: FC<RendererProps> = ({ node }) => {
    const api = getApi(node);    
    const { styles, box } = node;
    const cell = node.gridOptions?.contextInfo?.contextMenuInfo?.cell;
    const contextMenuItems: (ContextMenuItem | null)[] = [
        { className: "copy-cell-icon", label: LABELS.COPY_CELL, onClick: ()=>{cell && api.copyCell(cell); api.showHideContextMenu(false);}},
        { className: "copy-row-icon", label: LABELS.COPY_ROW, onClick: ()=>{cell && api.copyRow(cell); api.showHideContextMenu(false);} },
        null,
        { className: "copy-column-icon", label: LABELS.COPY_COLUMN, onClick: ()=> {cell && api.copyColumn(cell); api.showHideContextMenu(false);}},
        { className: "copy-table-icon", label: LABELS.COPY_TABLE, onClick: (e)=> {cell && api.copyAll(cell); api.showHideContextMenu(false);}},
        null,
        { className: "copy-cell-icon", label: LABELS.COPY_SELECTED_CELLS, onClick: ()=>{cell && api.copySelectedCells(cell); api.showHideContextMenu(false);}},
        { className: "copy-row-icon", label: LABELS.COPY_SELECTED_ROWS, onClick: ()=>{cell && api.copySelectedRows(cell); api.showHideContextMenu(false);} },
    ];
    const customItems = node.gridOptions.contextMenuOptions?.contextMenuItems?.(node, contextMenuItems) || contextMenuItems;
    return cell?<div className="euxdt-dg-context-menu euxdt-dg-popup" style={{ ...styles, ...box }}>
        {
             createMenu(node.gridOptions, {
                ...node,
                options: customItems || [], 
            })
        }
    </div>: null;
};

export const ContextMenuRenderer = (props: RendererProps) => <GridContextMenu key={props.node.key} {...props} />;