import { ApiContext, Box, camelCaseToSpace, ColumnOptions, createColumn, createFilterBehavior, Filter, FilterExpression, FilterOperation, FILTER_OPERATION_TYPE_PREDEFINED_LIST, getApi, getChatGptPrompt, getContext, getFlat, getRectFromDom, gridCSSPrefix, GridIconButton, GridSelectionMode, GRID_CONSTANTS, HorizontalScrollMode, isFilter, isFilterExpression, nullifyParent, pasteToClipboard, RendererProps, GridOptions } from "@ezgrid/grid-core";
import { FC, useEffect, useMemo, useRef, useState } from "react";
import { createDateField, createSelectField, createTextArea, createTextField } from "../adapter";
import { ReactDataGrid } from "../ReactDataGrid";
import { Popup, PopupButton } from "../shared";
import { buttonCreator, COL_PROPS, createDeleteColumn, GRID_PROPS } from "../shared/shared-props";
import { DateSelectFilter } from "./DateSelectFilter";
import { MultiSelectFilter } from "./MultiSelectFilter";
import { NumericRangeFilter } from "./NumericRangeFilter";

export interface FilterBuilderProps extends RendererProps {
    openOnMount?: boolean;
    ruleSaved?: () => void;
    predefinedLists?: string[];
    chatGptPlaceholder?: string;
}
export const openChatGpt = () => {
    alert("Chat GPT Prompt copied to clipboard, paste it into the chat window");
    window.open("https://chat.openai.com/", "_blank");
};
export const FilterBuilder: FC<FilterBuilderProps> = ({ node, openOnMount, ruleSaved, predefinedLists, chatGptPlaceholder }) => {
    const rootNode = node;
    const ctx = getContext(node.gridOptions);
    const cols = getFlat<ColumnOptions>(node.gridOptions.columns || []).filter(c => !c.excludeFromSettings);
    const api = getApi(node);
    const globalFilter = api.getGlobalFilterTree();
    const [popupVisible, setPopupVisibleInner] = useState(false);
    const [loading, setLoading] = useState(false);
    const setPopupVisible = (val: boolean) => {
        if (val) {
            api.suspendMouseEvents();
        } else {
            api.resumeMouseEvents();
        }
        setPopupVisibleInner(val);
    };
    useEffect(() => {
        if (openOnMount) {
            setBoundingRect();
            setPopupVisible(true);
        }
    }, [openOnMount]);
    const togglePopup = (val: boolean) => {
        if (openOnMount) return;
        if (val) {
            const filterValues = api.getAllFilterValues() || {};
            const hasFilter = Array.from(filterValues.entries()).length > 0;
            if (hasFilter) {
                if (window.confirm("The filter builder cannot be opened while quick filters are applied. Would you like to clear the filters and proceed?")) {
                    api.clearAllFilterValues();
                } else
                    return;
            }
        }
        setPopupVisible(val);
    };

    const [rectangle, setRectangle] = useState<Box>();
    const [filterString, setFilterString] = useState("");
    const [chatGptPrompt, setChatGptPrompt] = useState("");
    const [chatGptQuestion, setChatGptQuestion] = useState("");
    const filterBuilderOptions = node.gridOptions.toolbarOptions?.filterBuilderOptions;

    const setIds = (parent: Filter, id = "1") => {
        const children = parent.children;
        parent.id = id;
        children.forEach((child, idx) => {
            child.id = id + "." + (idx + 1);
            if ((child as Filter).logicalOperator)
                setIds(child as Filter, child.id);
        });
        return parent;
    };
    const getDefaultOperationForCol = (col: ColumnOptions) => col.format === "date" || col.format === "currency" || col.format === "number" ? FilterOperation.Between : FilterOperation.InList;
    const firstColWithFilter = cols.find(col => col.filterOptions);
    const defaultState = useMemo(() => {
        return ((globalFilter ? [setIds({ ...globalFilter })] : [
            setIds({
                id: "1",
                logicalOperator: "AND",
                children: firstColWithFilter ? [
                    {
                        id: "1.1",
                        col: cols[0],
                        expression: "",
                        operation: getDefaultOperationForCol(firstColWithFilter)
                    },

                ] : []
            }
            )]));
    }, [globalFilter]);
    useEffect(() => {
        setDataProvider(d => [...d]);
    }, [rootNode]);
    const [dataProvider, setDataProvider] = useState<Filter[]>(defaultState);
    const apiRef = useRef<ApiContext | null>(null);
    const processChatGptResponse = (response: string) => {
        let filter = null;
        const setColumn = (child: FilterExpression | Filter) => {
            if (isFilter(child)) {
                const filter = child;
                filter.children.forEach(setColumn);
            } else if (isFilterExpression(child)) {
                const filterExpression = child;
                filterExpression.col = cols.find(c => c.uniqueIdentifier === filterExpression.col.dataField)!;
            }
        };


        try {
            if (response.indexOf("```") > -1) {
                filter = JSON.parse(response.split("```")[1]);
            } else {
                filter = JSON.parse(response);
            }
            setColumn(filter);
            setDataProvider([setIds(filter)]);
            setTimeout(() => {
                const api = apiRef.current?.api;
                if (!api) return;
                api.expandAll();
            }, 100);
        } catch (e) {
            alert("Invalid response from chatbot, please ensure it is valid JSON");
        }
        return filter;
    };
    const allValues = cols?.map(col => ({ name: col.headerText, value: col.uniqueIdentifier })) || [];
    const allFields = [...allValues];
    const andOr = [{ name: "AND", value: "AND" }, { name: "OR", value: "OR" }];
    allValues.unshift(...andOr);
    const changeOperation = (e: string | number, data: FilterExpression) => {
        data.operation = e as FilterOperation;
        data.expression = "";
        refreshDp();
    };
    const getParent = (parent: Filter, item: Filter | FilterExpression): Filter | null => {
        if (parent.children.indexOf(item) > -1) {
            return parent;
        }
        for (let i = 0; i < parent.children.length; i++) {
            const child = parent.children[i];
            if (isFilter(child)) {
                const filter = child;
                const result = getParent(filter, item);
                if (result) return result;
            }
        }
        return null;
    };


    const changeNodeType = (e: string | number, data: Filter | FilterExpression) => {
        const filter = data as Filter;
        const expression = data as FilterExpression;
        //if data is filter, and new value is expression, remove the filter, and add expression to parent
        if (filter.logicalOperator && e !== "AND" && e !== "OR") {
            const parent = getParent(dataProvider[0], filter)!;
            const newExpression = {
                id: filter.id,
                col: cols.find(c => c.uniqueIdentifier === e) as ColumnOptions,
            } as FilterExpression;
            parent.children = parent.children.map(c => c.id === filter.id ? newExpression : c);
            refreshDp();
        }
        //if data is expression, and new value is filter, remove the expression, and add filter to parent
        if (!filter.logicalOperator && (e === "AND" || e === "OR")) {
            const parent = getParent(dataProvider[0], expression)!;
            const newFilter = {
                id: expression.id,
                logicalOperator: e,
                children: []
            } as Filter;
            parent.children = parent.children.map(c => c.id === expression.id ? newFilter : c);
            refreshDp();
        }
        //if data is expression, and new value is expression, change the expression
        if (!filter.logicalOperator && (e !== "AND" && e !== "OR")) {
            expression.col = cols.find(c => c.uniqueIdentifier === e) as ColumnOptions;
            expression.operation = getDefaultOperationForCol(expression.col);
            refreshDp();
        }
        //if data is filter, and new value is filter, change the filter
        if (filter.logicalOperator && (e === "AND" || e === "OR")) {
            filter.logicalOperator = e;
            refreshDp();
        }
    };
    const expressionChangeHandler = (exp: unknown, data: FilterExpression, rebuild = false) => {

        data.expression = exp;
        if (rebuild)
            refreshDp();
        api.repaint();
        setFilterString(api.buildFilterString(dataProvider[0]));
    };
    const addChildToNode = (node: Filter) => {
        (node).children.push({
            id: node.id + "." + (node.children.length + 1),
            col: cols[0],
            operation: FilterOperation.InList,
            expression: ""
        } as FilterExpression);
        refreshDp();
    };
    const removeChildFromNode = (node: any) => {
        const parent: Filter = getParent(dataProvider[0], node)!;
        if (!getParent(dataProvider[0], node)) {
            alert("Cannot remove root node");
            return;
        }
        (parent).children = (parent).children.filter(c => c.id !== node.id);
        refreshDp();
    };
    const refreshDp = () => {
        const newDp = [...dataProvider];
        setIds(newDp[0]);
        setDataProvider(newDp);
        setTimeout(() => {
            apiRef.current?.api?.expandAll();
        }, 100);
        setFilterString(api.buildFilterString(newDp[0]));
        return newDp;
    };


    const setBoundingRect = () => {
        const rect = getRectFromDom(api.getGridBox(true));
        if (rect) {
            setRectangle({ ...rect, width: openOnMount ? rect.width : "600px" });
        }
    };
    const applyFilter = () => {
        api.setGlobalFilterTree(dataProvider[0]);
        togglePopup(false);
    };
    const entries = Object.entries(FilterOperation);
    const operations = entries.map(([name, value]) => ({ name: camelCaseToSpace(name), value: value as string })).filter(nv => nv.name !== "None");
    if (openOnMount) {
        operations.push(
            { name: camelCaseToSpace(FILTER_OPERATION_TYPE_PREDEFINED_LIST), value: FILTER_OPERATION_TYPE_PREDEFINED_LIST }
        );
    }

    const gridOptions = useMemo<GridOptions>(() => ({
        isLoading: loading,
        ...GRID_PROPS(node, "id"),
        cellStyleFunction: undefined,
        rowStyleFunction: undefined,
        dividerOptions: undefined,
        enableFilters: false,
        dataProvider,
        horizontalScroll: HorizontalScrollMode.Off,
        selectionMode: GridSelectionMode.None,
        behaviors: [createFilterBehavior({})],
        eventBus: {
            onApiContextReady: (ctx) => {
                apiRef.current = ctx;
                apiRef.current?.api?.expandAll();
            }
        },
        nextLevel: {
            childrenField: "children",
        },
        enableDynamicLevels: true,
        columns: [
            createDeleteColumn((data) => removeChildFromNode(data as Filter | FilterExpression)),
            {
                ...createColumn("id", "string", "Id"),
                ...COL_PROPS(),
                enableHierarchy: true,
                headerOptions: {
                    headerRenderer: ({ node }) => {
                        return <div className="ezgrid-dg-horizontal-flex">
                            <div style={{ float: "left" }} >
                                Select Criteria
                            </div>
                            {
                                !openOnMount && <div style={{ float: "right", display: "flex", gap: 4 }} >
                                    {buttonCreator(node, "check-icon", "Apply Filter", applyFilter, GridIconButton.Apply, false)}
                                    {buttonCreator(node, "close-icon", "Close Popup", () => togglePopup(false),
                                        GridIconButton.Cancel, false)}
                                </div>
                            }
                        </div>;
                    }
                },
                itemRenderer: ({ node }) => {
                    const data = node.rowPosition?.data as (FilterExpression | Filter);
                    const filter = data as Filter;
                    const expression = data as FilterExpression;
                    const operation = (data as FilterExpression).operation;
                    return <div className={gridCSSPrefix("toolbar-section")}>
                        {createSelectField(node.gridOptions, {
                            style: { width: "200px" },
                            onChange: (newValue) => changeNodeType(newValue, data),
                            value: (filter).logicalOperator || (expression).col.dataField,
                            options: getParent(dataProvider[0], filter) ? allValues : andOr
                        })}
                        {data && (expression).col && <>
                            {createSelectField(node.gridOptions, {
                                style: { width: "100px" },
                                onChange: (newValue) => changeOperation(newValue, expression),
                                value: (expression).operation,
                                options: operations
                            })}
                            {
                                (operation.toString() === FILTER_OPERATION_TYPE_PREDEFINED_LIST) ?
                                    <div>
                                        {
                                            createSelectField(node.gridOptions, {
                                                style: { width: "200px" },
                                                onChange: (newValue) => expressionChangeHandler(newValue, expression),
                                                value: (expression).expression?.toString(),
                                                options: (predefinedLists || []).map(s => ({ name: s, value: s }))
                                            })
                                        }
                                    </div> :
                                    (operation === FilterOperation.InList
                                        || operation === FilterOperation.NotInList) ? <div>
                                        <MultiSelectFilter filterBuilderMode
                                            value={(expression).expression}
                                            onValueChanged={(val) => expressionChangeHandler(val, expression)}
                                            node={{
                                                ...rootNode,
                                                columnPosition: {
                                                    column: {
                                                        ...expression.col,
                                                        filterOptions: {
                                                            ...expression.col.filterOptions,
                                                            filterComboBoxDataProvider: cols?.find(c => c.uniqueIdentifier === expression.col.uniqueIdentifier)?.filterOptions?.filterComboBoxDataProvider
                                                        }
                                                    },
                                                    startPosition: 0,
                                                    width: 100,
                                                }

                                            }} />
                                    </div> :
                                        (operation === FilterOperation.IsNotNull
                                            || operation === FilterOperation.IsNull) ?
                                            <></>
                                            :
                                            operation === FilterOperation.Between ? <div>
                                                <>
                                                    {expression.col.format === "date" ?
                                                        <>
                                                            <DateSelectFilter filterBuilderMode
                                                                value={(expression).expression}
                                                                onValueChanged={(val) => expressionChangeHandler(val, expression)}
                                                                node={{
                                                                    ...rootNode,
                                                                    columnPosition: {
                                                                        column: (expression).col,
                                                                        startPosition: 0,
                                                                        width: 100,
                                                                    }

                                                                }} />
                                                        </>
                                                        :
                                                        <>
                                                            <NumericRangeFilter filterBuilderMode
                                                                value={(expression).expression}
                                                                numeric={expression.col.format === "number" || expression.col.format === "currency"}
                                                                onValueChanged={(val) => expressionChangeHandler(val, expression)}
                                                                node={{
                                                                    ...rootNode,
                                                                    columnPosition: {
                                                                        column: (expression).col,
                                                                        startPosition: 0,
                                                                        width: 100,
                                                                    }

                                                                }} />
                                                        </>
                                                    }
                                                </>
                                            </div> :
                                                expression.col.format === "date" ||
                                                    expression.col.format === "dateTime"
                                                    ?
                                                    createDateField(node.gridOptions, {
                                                        style: { width: "100px" },
                                                        onChange: (val) => expressionChangeHandler(val, data as FilterExpression),
                                                        value: (data as FilterExpression).expression as Date | null | undefined
                                                    })
                                                    : createTextField(node.gridOptions, {
                                                        style: { width: "100px" },
                                                        attributes: { name: (data as FilterExpression).col.uniqueIdentifier },
                                                        onChange: (val) => {
                                                            const focusId = (data as FilterExpression).col.uniqueIdentifier;
                                                            if (focusId) {
                                                                setTimeout(() => {
                                                                    const el = document.getElementsByName(focusId)?.[0];
                                                                    if (el) el.focus();
                                                                }, 100);
                                                            }
                                                            expressionChangeHandler(val, data as FilterExpression)
                                                        },
                                                        value: String((data as FilterExpression).expression) || ""
                                                    })
                            }



                        </>}
                        <div>
                            {filter?.logicalOperator && buttonCreator(node, "add-circle-icon", "Add Criteria",
                                () => addChildToNode(filter), GridIconButton.Plus)}
                        </div>
                    </div>;
                },

            }

        ]
    }), [dataProvider, loading]);
    return <>{!openOnMount &&
        <div className={gridCSSPrefix("toolbar-section")} >
            <PopupButton node={node} popupVisible={popupVisible} setPopupVisible={togglePopup}
                trigger={<div className="ezgrid-dg-toolbar-section">{
                    buttonCreator(node, "filter-builder-icon", "Filter Builder", setBoundingRect, GridIconButton.FilterBuilder)
                } {(ctx.modifications.globalFilterTree?.children || []).length > 0 &&
                    <><div className="ezgrid-dg-info-cell" title={api.buildFilterString(ctx.modifications.globalFilterTree as Filter)}></div>
                        {buttonCreator(node, "delete-icon", "Clear Builder", (e) => {
                            api.clearGlobalFilter();
                            e.stopPropagation();
                        }, GridIconButton.Delete)}</>
                    }  </div>}
            />|
        </div>
    }
        {openOnMount &&
            <div className={gridCSSPrefix("toolbar-section")} >
                {buttonCreator(node, "check-icon", "Apply Criteria", () => {
                    applyFilter();
                    ruleSaved?.();
                }, GridIconButton.Apply, false)}
            </div>
        }

        {
            popupVisible && <Popup node={node} rectangle={rectangle} setPopupVisible={togglePopup} makeBackground={openOnMount !== true}>
                <div className="ezgrid-dg-filter-builder" style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column" }}>
                    <div style={{ display: "flex", flex: 2 }}>
                        <ReactDataGrid style={{ height: "100%", width: "100%" }} gridOptions={gridOptions}></ReactDataGrid >

                    </div>
                    <div style={{ display: "flex", flex: 1, margin: 15, gap: 15, flexDirection: "column" }}>
                        {
                            filterString && <div >
                                <b>Filter String</b>
                                <pre>{filterString}</pre>
                            </div>
                        }
                        <div className="ezgrid-dg-card" style={{ flex: 1, width: "500px", display: filterBuilderOptions?.enableChatGpt === false ? 'none' : "" }} >

                            <b>Ask ChatGPT!</b>
                            <div className="ezgrid-dg-toolbar-section" style={{ width: "100%", flexDirection: "column" }}>
                                <div className="ezgrid-dg-toolbar-section" >
                                    Choose Field to ask Chat GPT:
                                    {
                                        createSelectField(node.gridOptions, {
                                            style: { width: "200px" },
                                            onChange: (val) => {
                                                setChatGptQuestion(chatGptQuestion + " " + val);
                                            },
                                            options: allFields,
                                        })
                                    }
                                </div>
                                {
                                    createTextArea(node.gridOptions, {
                                        style: { width: "100%", height: "100px" },
                                        value: chatGptQuestion,
                                        onChange: (val) => {
                                            setChatGptQuestion(val);
                                            const prompt = getChatGptPrompt(node.gridOptions, node.gridOptions.columns || [], val);
                                            setChatGptPrompt(prompt);
                                        }, rows: 4, placeholder: chatGptPlaceholder || "Ask Chat GPT to make a query : E.g. (department is IT or HR) and (salary is greater than 75000 or salary is less than 60000) OR (department is Sales and salary is greater than 90000 and state is in list NY, NJ)"
                                    })
                                }
                                <div className="ezgrid-dg-toolbar-section" >

                                    {
                                        buttonCreator(node, "copy-icon", "Copy GPT Prompt", async () => {
                                            await pasteToClipboard(chatGptPrompt);
                                            openChatGpt();
                                        }, GridIconButton.Copy, false, true)
                                    }

                                    {
                                        buttonCreator(node, "paste-icon", "Paste ChatGPT Response", async () => {
                                            const chatGptResponse = prompt("Paste Chat GPT response here");
                                            if (!chatGptResponse) return;
                                            const filter = processChatGptResponse(chatGptResponse);
                                            setFilterString(api.buildFilterString(filter));
                                            setTimeout(() => {
                                                const api = apiRef.current?.api;
                                                if (!api) return;
                                                api.expandAll();
                                            }, 100);
                                        }, GridIconButton.Paste, false, true)
                                    }
                                    {
                                        buttonCreator(node, "page-next-icon", "Ask Chat GPT", async () => {
                                            setLoading(true);
                                            const result = await callChatGpt(chatGptPrompt);
                                            setLoading(false);
                                            processChatGptResponse(result);

                                        }, GridIconButton.PageNext, false, true)
                                    }

                                </div>

                            </div>
                        </div>

                    </div>
                </div>

            </Popup>
        }
    </>;
};
export const callChatGpt = async (prompt: string) => {
    const endpoint = GRID_CONSTANTS.CHAT_GPT_ENDPOINT;
    let token = GRID_CONSTANTS.CHAT_GPT_API_KEY;
    if (!token) {
        token = window.prompt("No OpenAI API Key configured. If you have one, please enter") || "";
    }
    if (!token) {
        return;
    }
    else {
        GRID_CONSTANTS.CHAT_GPT_API_KEY = token;
    }
    const res = await fetch(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token
        },
        body: JSON.stringify({
            "model": GRID_CONSTANTS.CHAT_GPT_MODEL,
            "messages": [
                {
                    "role": "user",
                    "content": prompt
                }
            ]
        })
    }).then(res => res.json());
    console.log(res.choices[0].message.content);
    return res.choices[0].message.content;
};


