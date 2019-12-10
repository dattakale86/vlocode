import * as vscode from 'vscode';
import * as constants from '@constants';
import VlocityDatapackService, { ObjectEntry } from '../services/vlocityDatapackService';
import SObjectRecord from '../models/sobjectRecord';
import OpenSalesforceCommand from '../commands/openSalesforceCommand';
import { LogManager, Logger } from 'logging';
import DatapackUtil from 'datapackUtil';
import { groupBy, evalExpr } from '../util';

import * as exportQueryDefinitions from 'exportQueryDefinitions.yaml';
import { createRecordProxy, addFieldsToQuery } from 'salesforceUtil';
import BaseDataProvider from './baseDataProvider';

export default class DatapackDataProvider extends BaseDataProvider<DatapackNode> {

    private async onExport(node: DatapackNode) {
        if (node.nodeType == DatapackNodeType.Category) {
            // Collect all exportable nodes
            const children = await this.vlocode.withStatusBarProgress('Loading exportable datapacks...', () => this.getChildren(node));
            
            const exportableNodes = children.map(node => {
                if (node instanceof DatapackObjectGroupNode) {
                    const record = node.records.slice(-1)[0];
                    return record ? <ObjectEntry>{ 
                        id: record.Id, 
                        datapackType: node.datapackType, 
                        sobjectType: record.attributes.type
                    } : undefined;
                } 
                return node;
            }).filter(node => node !== undefined);

            this.executeCommand(constants.VlocodeCommand.exportDatapack, ...exportableNodes);
        } else if (node.nodeType == DatapackNodeType.Object) {
            this.executeCommand(constants.VlocodeCommand.exportDatapack, node);
        }
    }

    protected getCommands() {
        return {
            'vlocity.datapackExplorer.export': async (node) => this.onExport(node),
            'vlocity.datapackExplorer.openSalesforce': OpenSalesforceCommand,
            'vlocity.datapackExplorer.refresh': () => this.refresh()
        };
    }

    private get datapackService() : VlocityDatapackService {
        return this.vlocode.datapackService;
    }

    private get vlocityNamespace() : string {         
        return this.datapackService.vlocityNamespace;
    }

    public getTreeItem(node: DatapackNode): vscode.TreeItem {
        return {
            label: node.getItemLabel(),
            tooltip: node.getItemTooltip(),
            iconPath: this.getItemIconPath(node.icon),
            description: node.getItemDescription(),
            contextValue: `vlocity:datapack:${node.nodeType}`,
            collapsibleState: node.expandable ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
        };
    }

    public async getChildren(node?: DatapackNode): Promise<DatapackNode[]> {
        await this.vlocode.validateAll(true);
        const nodeSorter = (a: DatapackNode, b: DatapackNode) => a.getItemLabel().localeCompare(b.getItemLabel());
        
        if (!node) {
            return Object.keys(await this.datapackService.getQueryDefinitions()).map(
                dataPackType => new DatapackCategoryNode(dataPackType)
            ).sort(nodeSorter);
        } else if (node instanceof DatapackCategoryNode) {            
            const records = await this.getExportableRecords(node.datapackType);

            // set node to not expand in case there are no results
            if (!records) {
                node.expandable = false;
                this.refresh(node);
                return [];
            }

            // group results?
            const queryDefinitions = await this.datapackService.getQueryDefinitions();
            const nodeConfig = queryDefinitions[node.datapackType];
            if (nodeConfig && nodeConfig.groupKey) {
                return this.createDatapackGroupNodes(records, node.datapackType, nodeConfig.groupKey).sort(nodeSorter);
            }
            return this.createDatapackObjectNodes(records, node.datapackType).sort(nodeSorter);

        } else if (node instanceof DatapackObjectGroupNode) {
            return this.createDatapackObjectNodes(node.records, node.datapackType).sort(nodeSorter);            
        }
    }

    private async getExportableRecords(datapackType: string) : Promise<SObjectRecord[]> {        
        const connection = await this.datapackService.getJsForceConnection();
        const query = await this.getQuery(datapackType);

        this.logger.verbose(`Query: ${query}`);        
        const results = await connection.query<SObjectRecord>(query);            
        this.logger.log(`Found ${results.totalSize} exportable datapacks form type ${datapackType}`);

        return results.totalSize == 0 ? null : results.records.map(record => createRecordProxy(record));
    }

    protected get logger() : Logger {
        return LogManager.get(DatapackDataProvider);
    }

    private async getQuery(datapackType: string) {
        const queryDefinitions = await this.datapackService.getQueryDefinitions();
        const queryString = addFieldsToQuery(queryDefinitions[datapackType].query, 'Name');
        return queryString.replace(constants.NAMESPACE_PLACEHOLDER, this.vlocityNamespace);    
    }

    private createDatapackGroupNodes(records: SObjectRecord[], datapackType: string, groupByKey: string) : DatapackNode[] {
        const groupedRecords = groupBy(records, r => evalExpr(groupByKey, r));
        return Object.keys(groupedRecords).map(
            key => new DatapackObjectGroupNode(groupedRecords[key], datapackType)
        );
    }

    private createDatapackObjectNodes(records: SObjectRecord[], datapackType: string) : DatapackNode[] {
        return records.map(
            record => new DatapackObjectNode(record, datapackType)
        );
    }
}

enum DatapackNodeType {
    Category = 'category',
    Object = 'object',
    ObjectGroup = 'objectGroup'
}

abstract class DatapackNode {    
    constructor(
        public readonly nodeType: DatapackNodeType,
        public expandable: boolean = false,
        public icon: { light: string, dark: string } | string = undefined
    ) { }

    public abstract getItemLabel() : string;
    public abstract getItemTooltip() : string;
    public abstract getItemDescription() : string;
}

class DatapackCategoryNode extends DatapackNode {
    constructor(public datapackType: string) {
        super(DatapackNodeType.Category, true);
    }

    public getItemLabel() {
        return this.datapackType;
    }

    public getItemDescription() {
        return null;
    }

    public getItemTooltip() {
        return `View datapacks of type ${this.datapackType}`;
    }
}

class DatapackObjectGroupNode extends DatapackNode {
    constructor(
        public records: SObjectRecord[],
        public datapackType: string,
        public icon = {
            light: 'resources/light/package.svg',
            dark: 'resources/dark/package.svg'
        }
    ) {
        super(DatapackNodeType.ObjectGroup, true);
    }

    public getItemLabel() {
        return evalExpr(this.getLabelFormat(), this.records[0]);
    }
    
    public getItemDescription() {
        const nodeConfig = exportQueryDefinitions[this.datapackType];
        if (nodeConfig && nodeConfig.groupDescription) {
            return evalExpr(nodeConfig.groupDescription, { ...this.records[0], count: this.records.length });
        }
        return `${this.records.length} version(s)`;
    }

    public getLabelFormat() : string {
        const nodeConfig = exportQueryDefinitions[this.datapackType];
        if (nodeConfig && nodeConfig.groupName) {
            return nodeConfig.groupName;
        }
        return '\'<NO_GROUP_NAME>\' + Id';
    }

    public getItemTooltip() {
        return `Found ${this.records.length} versions`;
    }
}

class DatapackObjectNode extends DatapackNode implements ObjectEntry {
    constructor(
        public record: SObjectRecord,
        public datapackType: string,
        public icon = {
            light: 'resources/light/package.svg',
            dark: 'resources/dark/package.svg'
        }
    ) {
        super(DatapackNodeType.Object, false);
    }

    public getItemLabel() {
        const nodeConfig = exportQueryDefinitions[this.datapackType];        
        if (nodeConfig && nodeConfig.name) {
            return evalExpr(nodeConfig.name, this.record);
        }
        return  DatapackUtil.getLabel(this.record);
    }

    public getItemDescription() {
        const nodeConfig = exportQueryDefinitions[this.datapackType];        
        if (nodeConfig && nodeConfig.description) {
            return evalExpr(nodeConfig.description, this.record);
        }
        return this.id;
    }

    public getItemTooltip() {
        return this.record.attributes.url;
    }

    public get sobjectType(): string {
        return this.record.attributes.type;
    }

    public get id(): string {    
        return this.record.Id;
    }

    public get name(): string {
        return this.record.Name;
    }
}