import * as vscode from 'vscode';

import { DatapackCommand } from './datapackCommand';
import { evalExpr } from '../util';

import { ObjectEntry } from 'services/vlocityDatapackService';

export default class OpenSalesforceCommand extends DatapackCommand {

    private readonly namespaceResolver = {
        'vlocity': () => this.datapackService.vlocityNamespace
    };

    public execute(...args: any[]): void | Promise<void> {
        return this.openInSalesforce(args[0] || this.currentOpenDocument);
    }

    protected openInSalesforce(input: vscode.Uri | ObjectEntry) {     
        if (input instanceof vscode.Uri){
            return this.openFileInSalesforce(input);
        }
        return this.openObjectInSalesforce(input);
    }

    protected async openFileInSalesforce(selectedFile: vscode.Uri) {     
        // Resolve datapack
        const datapack = (await this.loadDatapacks([ selectedFile ])).pop();
        if (!datapack) {
            throw new Error(`${selectedFile.fsPath} not part of datapack`);
        }
        
        const salesforceId = (await this.datapackService.getSalesforceIds([ datapack ])).pop();        
        return this.openIdInSalesforce(salesforceId, datapack.datapackType);
    }

    protected async openObjectInSalesforce(obj: ObjectEntry) {  
        const salesforceId = obj.id || (await this.datapackService.getSalesforceIds([ obj ])).pop();        
        return this.openIdInSalesforce(salesforceId, obj.datapackType);
    }

    protected async openIdInSalesforce(objectId: string, datapackType: string, extraFields?: any) {    
        if (!objectId) {
            vscode.window.showErrorMessage('Unable to resolve Salesforce id for the selected item; it might not be deployed on the connected org.');
            return;
        }

        // Build URL
        const queryDefinitions = await this.datapackService.getQueryDefinitions();
        let salesforceUrl = queryDefinitions[datapackType].salesforceUrl || `'lightning/r/${objectId}/view'`;
        salesforceUrl = typeof salesforceUrl === 'string' ? { path: salesforceUrl } : salesforceUrl;

        const namespace = this.resolveNamespace(salesforceUrl.namespace);
        const salesforcePath = evalExpr(salesforceUrl.path, {...extraFields, id: objectId, type: datapackType, namespace: namespace });

        const url = await this.vloService.salesforceService.getPageUrl(salesforcePath);
        this.logger.info(`Opening URL: ${salesforcePath}`);
        vscode.env.openExternal(vscode.Uri.parse(url));
    }

    protected resolveNamespace(namespace: string) : string | undefined {
        if (namespace && this.namespaceResolver[namespace.toLowerCase()]) {
            return this.namespaceResolver[namespace.toLowerCase()]();
        } else if(namespace) {
            return namespace;
        }
    }
}