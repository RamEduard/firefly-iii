/*
 * show.js
 * Copyright (c) 2024 james@firefly-iii.org.
 *
 * This file is part of Firefly III (https://github.com/firefly-iii).
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see https://www.gnu.org/licenses/.
 */

import '../../boot/bootstrap.js';
import dates from "../shared/dates.js";
import i18next from "i18next";
import {format} from "date-fns";
import formatMoney from "../../util/format-money.js";

import '@ag-grid-community/styles/ag-grid.css';
import '@ag-grid-community/styles/ag-theme-alpine.css';
import '../../css/grid-ff3-theme.css';
import Get from "../../api/v2/model/account/get.js";
import Put from "../../api/v2/model/account/put.js";
import AccountRenderer from "../../support/renderers/AccountRenderer.js";
import {showInternalsButton} from "../../support/page-settings/show-internals-button.js";
import {showWizardButton} from "../../support/page-settings/show-wizard-button.js";
import {getVariable} from "../../store/get-variable.js";
import {setVariable} from "../../store/set-variable.js";


// set type from URL
const beforeQuery = window.location.href.split('?');
const urlParts = beforeQuery[0].split('/');
const type = urlParts[urlParts.length - 1];

let sortingColumn = '';
let sortDirection = '';

// get sort parameters
const params = new Proxy(new URLSearchParams(window.location.search), {
    get: (searchParams, prop) => searchParams.get(prop),
});
sortingColumn = params.column ?? '';
sortDirection = params.direction ?? '';


showInternalsButton();
showWizardButton();

let index = function () {
    return {
        // notifications
        notifications: {
            error: {
                show: false, text: '', url: '',
            }, success: {
                show: false, text: '', url: '',
            }, wait: {
                show: false, text: '',

            }
        },
        totalPages: 1,
        page: 1,
        filters: {
            active: 'both',
        },

        // available columns:
        // visible is hard coded, enabled is user-configurable.
        tableColumns: {
            drag_and_drop: {
                visible: true,
                enabled: true,
            },
            active: {
                visible: true,
                enabled: true,
            },
            name: {
                visible: true,
                enabled: true,
            },
            type: {
                visible: type === 'asset',
                enabled: true,
            },
            liability_type: {
                visible: type === 'liabilities',
                enabled: true,
            },
            liability_direction: {
                visible: type === 'liabilities',
                enabled: true,
            },
            liability_interest: {
                visible: type === 'liabilities',
                enabled: true,
            },
            number: {
                visible: true,
                enabled: true,
            },
            current_balance: {
                visible: type !== 'liabilities',
                enabled: true,
            },
            amount_due: {
                visible: type === 'liabilities',
                enabled: true,
            },
            last_activity: {
                visible: true,
                enabled: true,
            },
            balance_difference: {
                visible: true,
                enabled: true,
            },
            menu: {
                visible: true,
                enabled: true,
            },
        },
        editors: {},
        sortingColumn: sortingColumn,
        sortDirection: sortDirection,
        accounts: [],

        accountRole(roleName) {
            return i18next.t('firefly.account_role_' + roleName);
        },

        sort(column) {
            this.sortingColumn = column;
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
            const url = './accounts/' + type + '?column=' + column + '&direction=' + this.sortDirection;

            window.history.pushState({}, "", url);

            this.loadAccounts();
            return false;
        },

        formatMoney(amount, currencyCode) {
            return formatMoney(amount, currencyCode);
        },

        format(date) {
            return format(date, i18next.t('config.date_time_fns'));
        },
        saveColumnSettings() {
            let newSettings = {};
            for (let key in this.tableColumns) {
                if (this.tableColumns.hasOwnProperty(key)) {
                    newSettings[key] = this.tableColumns[key].enabled;
                }
            }
            console.log('New settings', newSettings);
            setVariable('accts_columns_' + type, newSettings);
        },

        init() {
            this.notifications.wait.show = true;
            this.notifications.wait.text = i18next.t('firefly.wait_loading_data')

            const key = 'accts_columns_' + type;
            const defaultValue = {"drag_and_drop": false};

            getVariable(key, defaultValue).then((response) => {
                for (let k in response) {
                    if (response.hasOwnProperty(k) && this.tableColumns.hasOwnProperty(k)) {
                        this.tableColumns[k].enabled = response[k] ?? true;
                    }
                }
            }).then(() => {
                this.loadAccounts();
            });

        },
        renderObjectValue(field, account) {
            let renderer = new AccountRenderer();
            if ('name' === field) {
                return renderer.renderName(account);
            }
        },
        submitInlineEdit(e) {
            e.preventDefault();
            const newTarget = e.currentTarget;
            const index = newTarget.dataset.index;
            const fieldName = newTarget.dataset.field;
            const accountId = newTarget.dataset.id;
            // need to find the input thing
            console.log('Clicked edit button for account on index #' + index + ' and field ' + fieldName);
            const querySelector = 'input[data-field="' + fieldName + '"][data-index="' + index + '"]';
            console.log(querySelector);
            const newValue = document.querySelectorAll(querySelector)[0].value ?? '';
            if ('' === newValue) {
                return;
            }
            console.log('new field name is ' + fieldName + '=' + newValue + ' for account #' + newTarget.dataset.id);
            const params = {};
            params[fieldName] = newValue;
            (new Put()).put(accountId, params);

            // update value, should auto render correctly!
            this.accounts[index][fieldName] = newValue;
            this.accounts[index].nameEditorVisible = false;
        },
        cancelInlineEdit(e) {
            const newTarget = e.currentTarget;
            const index = newTarget.dataset.index;
            this.accounts[index].nameEditorVisible = false;
        },
        triggerEdit(e) {
            const target = e.currentTarget;
            const index = target.dataset.index;
            const id = target.dataset.id;
            console.log('Index of this row is ' + index + ' and ID is ' + id);
            this.accounts[index].nameEditorVisible = true;
        },
        loadAccounts() {

            // sort instructions
            const sorting = [{column: this.sortingColumn, direction: this.sortDirection}];

            // get start and end from the store:
            const start = new Date(window.store.get('start'));
            const end = new Date(window.store.get('end'));

            let params = {
                sorting: sorting,
                type: type,
                page: this.page,
                start: start,
                end: end
            };

            if(!this.tableColumns.balance_difference.enabled){
                delete params.start;
                delete params.end;
            }

            this.notifications.wait.show = true;
            this.notifications.wait.text = i18next.t('firefly.wait_loading_data')
            this.accounts = [];

            // one page only.o
            (new Get()).index(params).then(response => {
                for (let i = 0; i < response.data.data.length; i++) {
                    if (response.data.data.hasOwnProperty(i)) {
                        let current = response.data.data[i];
                        let account = {
                            id: parseInt(current.id),
                            active: current.attributes.active,
                            name: current.attributes.name,
                            nameEditorVisible: false,
                            type: current.attributes.type,
                            role: current.attributes.account_role,
                            iban: null === current.attributes.iban ? '' : current.attributes.iban.match(/.{1,4}/g).join(' '),
                            account_number: null === current.attributes.account_number ? '' : current.attributes.account_number,
                            current_balance: current.attributes.current_balance,
                            currency_code: current.attributes.currency_code,
                            native_current_balance: current.attributes.native_current_balance,
                            native_currency_code: current.attributes.native_currency_code,
                            last_activity: null === current.attributes.last_activity ? '' : format(new Date(current.attributes.last_activity), i18next.t('config.month_and_day_fns')),
                            balance_difference: current.attributes.balance_difference,
                            native_balance_difference: current.attributes.native_balance_difference
                        };
                        console.log(current.attributes.balance_difference);
                        this.accounts.push(account);
                    }
                }
                this.notifications.wait.show = false;
                // add click trigger thing.
            });
        },
    }
}

let comps = {index, dates};

function loadPage() {
    Object.keys(comps).forEach(comp => {
        console.log(`Loading page component "${comp}"`);
        let data = comps[comp]();
        Alpine.data(comp, () => data);
    });


    Alpine.magic("t", (el) => {
        return (name, vars) => {
            return i18next.t(name, vars);
        };
    });

    Alpine.start();
}

// wait for load until bootstrapped event is received.
document.addEventListener('firefly-iii-bootstrapped', () => {
    console.log('Loaded through event listener.');
    loadPage();
});
// or is bootstrapped before event is triggered.
if (window.bootstrapped) {
    console.log('Loaded through window variable.');
    loadPage();
}
