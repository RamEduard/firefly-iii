<?php


/*
 * BudgetController.php
 * Copyright (c) 2023 james@firefly-iii.org
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
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

declare(strict_types=1);

namespace FireflyIII\Api\V2\Controllers\Chart;

use Carbon\Carbon;
use FireflyIII\Api\V2\Controllers\Controller;
use FireflyIII\Api\V2\Request\Generic\DateRequest;
use FireflyIII\Exceptions\FireflyException;
use FireflyIII\Models\Budget;
use FireflyIII\Models\BudgetLimit;
use FireflyIII\Models\TransactionCurrency;
use FireflyIII\Repositories\Budget\BudgetLimitRepositoryInterface;
use FireflyIII\Repositories\UserGroups\Budget\BudgetRepositoryInterface;
use FireflyIII\Repositories\UserGroups\Budget\OperationsRepositoryInterface;
use FireflyIII\Support\Http\Api\CleansChartData;
use FireflyIII\Support\Http\Api\ExchangeRateConverter;
use FireflyIII\Support\Http\Api\ValidatesUserGroupTrait;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Collection;

/**
 * Class BudgetController
 */
class BudgetController extends Controller
{
    use CleansChartData;
    use ValidatesUserGroupTrait;

    protected OperationsRepositoryInterface $opsRepository;
    private BudgetLimitRepositoryInterface  $blRepository;
    private array                           $currencies = [];
    private TransactionCurrency             $currency;
    private BudgetRepositoryInterface       $repository;

    public function __construct()
    {
        parent::__construct();
        $this->middleware(
            function ($request, $next) {
                $this->repository    = app(BudgetRepositoryInterface::class);
                $this->blRepository  = app(BudgetLimitRepositoryInterface::class);
                $this->opsRepository = app(OperationsRepositoryInterface::class);
                $this->currency      = app('amount')->getDefaultCurrency();

                $userGroup = $this->validateUserGroup($request);
                if (null !== $userGroup) {
                    $this->repository->setUserGroup($userGroup);
                    $this->opsRepository->setUserGroup($userGroup);
                }

                return $next($request);
            }
        );
    }

    /**
     * @param DateRequest $request
     *
     * TODO see autocomplete/accountcontroller
     *
     * @return JsonResponse
     * @throws FireflyException
     */
    public function dashboard(DateRequest $request): JsonResponse
    {
        $params = $request->getAll();
        /** @var Carbon $start */
        $start = $params['start'];
        /** @var Carbon $end */
        $end = $params['end'];

        // code from FrontpageChartGenerator, but not in separate class
        $budgets = $this->repository->getActiveBudgets();
        $data    = [];
        /** @var Budget $budget */
        foreach ($budgets as $budget) {
            // could return multiple arrays, so merge.
            $data = array_merge($data, $this->processBudget($budget, $start, $end));
        }
        return response()->json($this->clean($data));
    }

    /**
     * @param Budget $budget
     * @param Carbon $start
     * @param Carbon $end
     *
     * @return array
     * @throws FireflyException
     */
    private function processBudget(Budget $budget, Carbon $start, Carbon $end): array
    {
        // get all limits:
        $limits = $this->blRepository->getBudgetLimits($budget, $start, $end);
        $rows   = [];

        // if no limits
        if (0 === $limits->count()) {
            // return as a single item in an array
            $rows = $this->noBudgetLimits($budget, $start, $end);
        }
        if ($limits->count() > 0) {
            $rows = $this->budgetLimits($budget, $limits);
        }
        // is always an array
        $return = [];
        foreach ($rows as $row) {
            $current  = [
                'label'                   => $budget->name,
                'currency_id'             => (string)$row['currency_id'],
                'currency_code'           => $row['currency_code'],
                'currency_name'           => $row['currency_name'],
                'currency_decimal_places' => $row['currency_decimal_places'],
                'native_id'               => (string)$row['native_id'],
                'native_code'             => $row['native_code'],
                'native_name'             => $row['native_name'],
                'native_decimal_places'   => $row['native_decimal_places'],
                'period'                  => null,
                'start'                   => $row['start'],
                'end'                     => $row['end'],
                'entries'                 => [
                    'spent'     => $row['spent'],
                    'left'      => $row['left'],
                    'overspent' => $row['overspent'],
                ],
                'native_entries'          => [
                    'spent'     => $row['native_spent'],
                    'left'      => $row['native_left'],
                    'overspent' => $row['native_overspent'],
                ],
            ];
            $return[] = $current;
        }
        return $return;
    }

    /**
     * When no budget limits are present, the expenses of the whole period are collected and grouped.
     * This is grouped per currency. Because there is no limit set, "left to spend" and "overspent" are empty.
     *
     * @param Budget $budget
     * @param Carbon $start
     * @param Carbon $end
     *
     * @return array
     * @throws FireflyException
     */
    private function noBudgetLimits(Budget $budget, Carbon $start, Carbon $end): array
    {
        $budgetId = (int)$budget->id;
        $spent    = $this->opsRepository->listExpenses($start, $end, null, new Collection([$budget]));
        return $this->processExpenses($budgetId, $spent, $start, $end);
    }

    /**
     * Shared between the "noBudgetLimits" function and "processLimit".
     *
     * Will take a single set of expenses and return its info.
     *
     * @param int   $budgetId
     * @param array $array
     *
     * @return array
     * @throws FireflyException
     */
    private function processExpenses(int $budgetId, array $array, Carbon $start, Carbon $end): array
    {
        $converter = new ExchangeRateConverter();
        $return    = [];

        /**
         * This array contains the expenses in this budget. Grouped per currency.
         * The grouping is on the main currency only.
         *
         * @var int   $currencyId
         * @var array $block
         */
        foreach ($array as $currencyId => $block) {
            $this->currencies[$currencyId] = $this->currencies[$currencyId] ?? TransactionCurrency::find($currencyId);
            $return[$currencyId]           = $return[$currencyId] ?? [
                'currency_id'             => (string)$currencyId,
                'currency_code'           => $block['currency_code'],
                'currency_name'           => $block['currency_name'],
                'currency_symbol'         => $block['currency_symbol'],
                'currency_decimal_places' => (int)$block['currency_decimal_places'],
                'native_id'               => (string)$this->currency->id,
                'native_code'             => $this->currency->code,
                'native_name'             => $this->currency->name,
                'native_symbol'           => $this->currency->symbol,
                'native_decimal_places'   => (int)$this->currency->decimal_places,
                'start'                   => $start->toAtomString(),
                'end'                     => $end->toAtomString(),
                'spent'                   => '0',
                'native_spent'            => '0',
                'left'                    => '0',
                'native_left'             => '0',
                'overspent'               => '0',
                'native_overspent'        => '0',

            ];
            $currentBudgetArray            = $block['budgets'][$budgetId];
            //var_dump($return);
            /** @var array $journal */
            foreach ($currentBudgetArray['transaction_journals'] as $journal) {

                // convert the amount to the native currency.
                $rate            = $converter->getCurrencyRate($this->currencies[$currencyId], $this->currency, $journal['date']);
                $convertedAmount = bcmul($journal['amount'], $rate);
                if ($journal['foreign_currency_id'] === $this->currency->id) {
                    $convertedAmount = $journal['foreign_amount'];
                }

                $return[$currencyId]['spent']        = bcadd($return[$currencyId]['spent'], $journal['amount']);
                $return[$currencyId]['native_spent'] = bcadd($return[$currencyId]['native_spent'], $convertedAmount);
            }
        }
        return $return;
    }

    /**
     * Function that processes each budget limit (per budget).
     *
     * If you have a budget limit in EUR, only transactions in EUR will be considered.
     * If you have a budget limit in GBP, only transactions in GBP will be considered.
     *
     * If you have a budget limit in EUR, and a transaction in GBP, it will not be considered for the EUR budget limit.
     *
     * @param Budget     $budget
     * @param Collection $limits
     *
     * @return array
     * @throws FireflyException
     */
    private function budgetLimits(Budget $budget, Collection $limits): array
    {
        app('log')->debug(sprintf('Now in budgetLimits(#%d)', $budget->id));
        $data = [];
        /** @var BudgetLimit $limit */
        foreach ($limits as $limit) {
            $data = array_merge($data, $this->processLimit($budget, $limit));
        }

        return $data;
    }

    /**
     * @param Budget      $budget
     * @param BudgetLimit $limit
     *
     * @return array
     * @throws FireflyException
     */
    private function processLimit(Budget $budget, BudgetLimit $limit): array
    {
        $budgetId = (int)$budget->id;
        $end      = clone $limit->end_date;
        $end->endOfDay();
        $spent                = $this->opsRepository->listExpenses($limit->start_date, $end, null, new Collection([$budget]));
        $limitCurrencyId      = (int)$limit->transaction_currency_id;
        $limitCurrency        = $limit->transactionCurrency;
        $converter            = new ExchangeRateConverter();
        $filtered             = [];
        $rate                 = $converter->getCurrencyRate($limitCurrency, $this->currency, $limit->start_date);
        $convertedLimitAmount = bcmul($limit->amount, $rate);


        /** @var array $entry */
        foreach ($spent as $currencyId => $entry) {
            // only spent the entry where the entry's currency matches the budget limit's currency
            // so $filtered will only have 1 or 0 entries
            if ($entry['currency_id'] === $limitCurrencyId) {
                $filtered[$currencyId] = $entry;
            }
        }
        $result = $this->processExpenses($budgetId, $filtered, $limit->start_date, $end);
        if (1 === count($result)) {
            $compare = bccomp((string)$limit->amount, app('steam')->positive($result[$limitCurrencyId]['spent']));
            if (1 === $compare) {
                // convert this amount into the native currency:
                $result[$limitCurrencyId]['left']        = bcadd($limit->amount, $result[$limitCurrencyId]['spent']);
                $result[$limitCurrencyId]['native_left'] = bcadd($convertedLimitAmount, $result[$limitCurrencyId]['native_spent']);
            }
            if ($compare <= 0) {
                $result[$limitCurrencyId]['overspent']        = app('steam')->positive(bcadd($limit->amount, $result[$limitCurrencyId]['spent']));
                $result[$limitCurrencyId]['native_overspent'] = app('steam')->positive(bcadd($convertedLimitAmount, $result[$limitCurrencyId]['native_spent']));
            }
        }
        return $result;
    }


}
