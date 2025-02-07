import { ColumnOptions, createColumn, createEditBehavior, createFilterBehavior, FilterOperation, FilterPageSortArguments, FilterPageSortChangeReason, FilterPageSortLoadMode, GridOptions, ServerInfo } from "@ezgrid/grid-core";
import { createMultiSelectFilterOptions, createNumericRangeFilterOptions, createTextInputFilterOptions, ReactDataGrid } from "@ezgrid/grid-react";
import { useEffect, useMemo, useState } from "react";
import { client } from "../graphql/client/apollo-client";
import { BusinessQuery } from "../graphql/client/queries/business";
import { createExcelBehavior, createPdfBehavior } from "@ezgrid/grid-export";
import { materialAdapter, materialNodePropsFunction } from "@ezgrid/grid-shared";
import { useTheme } from "@mui/material";


export const RestaurantsDataGrid = () => {
    const [loading, setLoading] = useState<boolean>(true);
    const [request, setRequest] = useState<FilterPageSortArguments>();
    const [response, setResponse] = useState<ServerInfo>({});
    const columns =[
        {
            ...createColumn("business_id", "number", "Business_id", "business_id"),
            filterOptions: createTextInputFilterOptions(FilterOperation.Equals),
            formatterPrecision: 0,
            width: 100,
            textAlign: "right"
        },
        {
            ...createColumn("name", "string", "Name"),
            filterOptions: createMultiSelectFilterOptions()
        },
        {
            ...createColumn("TaxCode", "string", "Tax Code"),
            filterOptions: createMultiSelectFilterOptions()
        },
        {
            ...createColumn("inspection_count", "number", "Inspection Count"),
            width: 100,
            footerOptions:{footerLabel: "Total: "},
            formatterPrecision: 0,
            textAlign: "right"
        },
        {
            ...createColumn("violation_count", "number", "Violation Count"),
            footerOptions:{footerLabel: "Total: "},
            width: 100,
            formatterPrecision: 0,
            textAlign: "right"
        },
        {
            ...createColumn("address", "string", "Address"),
            filterOptions: createTextInputFilterOptions(FilterOperation.Wildcard),
        },
        {
            ...createColumn("city", "string", "City"),
            filterOptions: createMultiSelectFilterOptions()
        },
        {
            ...createColumn("postal_code", "number", "Postal_code"),
            filterOptions: createTextInputFilterOptions(FilterOperation.Wildcard),
        },
        {
            ...createColumn("latitude", "number", "Latitude"),
            filterOptions: createNumericRangeFilterOptions(),
        },
        {
            ...createColumn("longitude", "number", "Longitude"),
            filterOptions: createNumericRangeFilterOptions(),
        },
        {
            ...createColumn("business_certificate", "number", "Business_certificate"),
            filterOptions: createNumericRangeFilterOptions(),
        },
        {
            ...createColumn("owner_name", "string", "Owner_name"),
            filterOptions: createTextInputFilterOptions(FilterOperation.Wildcard),
        },
        {
            ...createColumn("owner_address", "number", "Owner_address"),
            filterOptions: createNumericRangeFilterOptions(),
        },
        {
            ...createColumn("owner_city", "string", "Owner_city"),
            filterOptions: createTextInputFilterOptions(FilterOperation.Wildcard),
        },
        {
            ...createColumn("owner_state", "string", "Owner_state"),
            filterOptions: createTextInputFilterOptions(FilterOperation.Wildcard),
        },
        {
            ...createColumn("owner_zip", "number", "Owner_zip"),
            filterOptions: createNumericRangeFilterOptions(),
        }
    ] as ColumnOptions[];
    const uniqueIdentifierOptions = useMemo(() => ({
        useField: "business_id",
    }), []);
    const initialLoadDistinctValueColumns = useMemo(() => ["name", "city","TaxCode"], []);
    useEffect(() => {
        //Initial load
        setRequest({
            distinctValueColumns: columns.filter(c => initialLoadDistinctValueColumns.includes(c.dataField)) || [],
            filter: { children: [] },
            pagination: { pageSize: 100, currentPage: 1 },
            reason: FilterPageSortChangeReason.InitialLoad,
        });
    }, [initialLoadDistinctValueColumns]);
    useEffect(() => {
        if (!request) return;
        const getServerData = async (filterPageSortArgs: FilterPageSortArguments) => {
            setLoading(true);
            const response = await client.query({
                query: BusinessQuery,
                variables: {
                    args: filterPageSortArgs,
                },
            })
            const result = response.data.businesses;
            const newResponse = {...result};
            setResponse(s=>{
                //Merge the new response with the old response.
                if (Object.keys(result.filterDistinctValues || {}).length > 0) {
                    newResponse.filterDistinctValues = { ...s.filterDistinctValues, ...(JSON.parse(JSON.stringify(result.filterDistinctValues))) };
                } else {
                    delete newResponse.filterDistinctValues;
                }
                return {
                    ...s,
                    ...newResponse,
                    pagination: {
                        ...s.pagination,
                        ...newResponse.pagination,
                    },
                };
            });
            setLoading(false);
        };
        getServerData(request);
    }, [request]);
    const theme = useTheme();
    const gridOptions = useMemo<GridOptions>(() => ({
        dataProvider: response?.currentPageData,
        filterPageSortMode: FilterPageSortLoadMode.Server,
        enablePaging: true,

      behaviors: [createFilterBehavior({}),
        createPdfBehavior({}),
        createExcelBehavior({}),
        createEditBehavior({ })
        ],
        adapter: materialAdapter,
        nodePropsFunction: materialNodePropsFunction(theme),
        serverInfo: response,
        toolbarOptions: {
            enableGlobalSearch: false,
            enableExcel:true,
            enablePdf:true,
        },
        eventBus: {
            onFilterPageSortChanged: (args: FilterPageSortArguments, reason: FilterPageSortChangeReason) => {
                setRequest({
                    ...args,
                    reason,
                    distinctValueColumns: [],//don't need distinct values on subsequent calls
                });
            },
            onExportPageRequested: async(args) => {
                const response = await client.query({
                    query: BusinessQuery,
                    variables: {
                        args,
                    },
                });
                return response.data.businesses.currentPageData;
            },
        },
        isLoading: loading,
        uniqueIdentifierOptions,
        columns
    }), [response, theme, loading, uniqueIdentifierOptions,columns]);

    return (
        <ReactDataGrid style={{height:"100%", }}
        gridOptions={gridOptions} />
    );
};