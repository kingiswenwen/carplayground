"""Create only the authorized low-threshold COS/CDN reminder; never deploy or buy."""
import argparse
import datetime
import hashlib
import json
import logging
import os
from pathlib import Path
import stat

ROOT = Path(__file__).resolve().parents[1]
NAME = 'CarPlayground-COS-CDN-1CNY'
PLAN = {'BudgetName': NAME, 'CycleType': 'MONTH', 'PeriodBegin': '2026-10',
        'PeriodEnd': '2099-12', 'PlanType': 'FIX', 'BudgetQuota': '1',
        'BillType': 'BILL', 'FeeType': 'REAL_COST',
        'WarnJson': [{'WarnType': 'ACTUAL', 'CalType': 'ABS', 'ThresholdValue': '1'}],
        'BudgetNote': 'User requested cost reminders only. No deployment, purchase, spending cap or automatic shutdown. Account COS/CDN products; not isolated to a single bucket.',
        'DimensionsRange': {'Business': ['p_cos', 'p_cdn']}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--execute', action='store_true')
    parser.add_argument('--output', type=Path, default=ROOT / 'docs/development/tencent-budget-alert-check.json',
                        help='New receipt path; existing receipts must not be replaced')
    args = parser.parse_args()
    receipt = {'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
               'scope': 'Account COS/CDN product costs only; new reminder, no changes to deployments or other services',
               'plan': PLAN, 'executed': False, 'created': False, 'verified': False,
               'planSha256': hashlib.sha256(json.dumps(PLAN, sort_keys=True).encode()).hexdigest(),
               'notASpendingCap': True, 'noPurchase': True, 'appUploaded': False,
               'notificationDeliveryTested': False,
               'sources': ['https://cloud.tencent.com/document/api/555/123661',
                           'https://cloud.tencent.com/document/product/555/65784']}
    if not args.execute:
        print(json.dumps(receipt, ensure_ascii=False, indent=2))
        return
    destination = args.output.resolve()
    # Reserve the receipt before importing the SDK or reading credentials. Later
    # saves update only this run's new file, preserving earlier cloud evidence.
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open('x') as file:
        json.dump(receipt, file, ensure_ascii=False, indent=2)
    from tencentcloud.common.abstract_client import AbstractClient
    from tencentcloud.common.credential import Credential
    from tencentcloud.common.profile.client_profile import ClientProfile
    class BudgetClient(AbstractClient):
        _apiVersion = '2018-07-09'
        _endpoint = 'billing.tencentcloudapi.com'
        _service = 'billing'
    private = Path.home() / '.cache/carplayground-cloud-private'
    key_file = private / 'credentials.json'
    if stat.S_IMODE(private.stat().st_mode) != 0o700 or stat.S_IMODE(key_file.stat().st_mode) != 0o600:
        raise ValueError('Credentials must stay in the owner-only private directory')
    key = json.loads(key_file.read_text())
    logging.disable(logging.CRITICAL)
    profile = ClientProfile()
    profile.httpProfile.reqTimeout = 20
    client = BudgetClient(Credential(key['secretId'], key['secretKey']), '', profile)
    request_ids = []
    def save():
        receipt['requestIds'] = request_ids
        destination.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n')
    def call(action, params):
        response = json.loads(client.call(action, params))['Response']
        request_ids.append({'action': action, 'requestId': response.get('RequestId')})
        name = private / ('budget-' + action + '-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S.%fZ') + '.json')
        with os.fdopen(os.open(name, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600), 'w') as file:
            json.dump(response, file, ensure_ascii=False, indent=2)
        if response.get('Code') != 0:
            raise ValueError('Budget API returned a non-success code')
        return response
    try:
        before = call('DescribeBudget', {'PageNo': 1, 'PageSize': 100, 'BudgetName': NAME})
        matches = [r for r in (before.get('Data') or {}).get('Records', []) if r.get('BudgetName') == NAME]
        if len(matches) > 1:
            raise ValueError('Multiple matching reminders; refusing to modify any')
        receipt['executed'] = True
        if not matches:
            receipt['createAttempted'] = True
            save()
            response = call('CreateBudget', PLAN)
            receipt['created'] = True
            receipt['budgetId'] = str(response['Data']['BudgetId'])
        else:
            receipt['budgetId'] = str(matches[0]['BudgetId'])
        after = call('DescribeBudget', {'PageNo': 1, 'PageSize': 100, 'BudgetId': receipt['budgetId']})
        rows = (after.get('Data') or {}).get('Records') or []
        row = next((r for r in rows if str(r.get('BudgetId')) == receipt['budgetId']), None)
        if row is None:
            raise ValueError('Created reminder was not returned by read-back')
        for key in ['BudgetName', 'CycleType', 'PeriodBegin', 'PeriodEnd', 'PlanType', 'BillType', 'FeeType']:
            if row.get(key) != PLAN[key]:
                raise ValueError('Budget read-back differs: ' + key)
        if float(row['BudgetQuota']) != 1 or row['WarnJson'] != PLAN['WarnJson']:
            raise ValueError('Budget threshold differs from the one-yuan monthly reminder')
        if sorted((row.get('DimensionsRange') or {}).get('Business') or []) != ['p_cdn', 'p_cos']:
            raise ValueError('Budget product scope differs')
        receipt['budgetStatus'] = row.get('BudgetStatus')
        receipt['notificationDefaultMode'] = row.get('DefaultMode')
        receipt['notificationRules'] = [{key: rule.get(key) for key in ['ReceiverType', 'NoticeWays', 'WeekDays', 'StartTime', 'EndTime']}
                                        for rule in (row.get('BudgetSendInfoForm') or [])]
        receipt['verified'] = row.get('BudgetStatus') == 'ACTIVE'
        receipt['notificationConfigurationVisible'] = bool(receipt['notificationRules'])
        save()
        if not receipt['verified']:
            raise ValueError('Reminder exists but is not active')
        print(json.dumps(receipt, ensure_ascii=False, indent=2))
    except Exception as error:
        receipt['failureType'] = type(error).__name__
        receipt['failureCode'] = error.get_code() if hasattr(error, 'get_code') else 'LocalValidation'
        # Do not print SDK request/response details or credentials.
        save()
        print(json.dumps({key: receipt.get(key) for key in ['executed', 'createAttempted', 'created', 'budgetId', 'failureType', 'failureCode']}, ensure_ascii=False))
        raise SystemExit(1)


if __name__ == '__main__':
    main()
