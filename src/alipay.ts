import { readFile } from 'node:fs/promises';

import type { AlipayConfig } from './config.js';

export class AlipayConfigError extends Error {
  code = 'alipay_config_missing';

  constructor(message: string) {
    super(message);
    this.name = 'AlipayConfigError';
  }
}

export interface CreateAlipayPaymentArgs {
  outTradeNo: string;
  totalAmount: string;
  subject: string;
  body?: string;
}

function requireConfig(value: string | undefined, name: string) {
  if (!value) {
    throw new AlipayConfigError(`${name} is required for Alipay payment`);
  }

  return value;
}

export async function createAlipaySdk(config: AlipayConfig) {
  const { AlipaySdk } = await import('alipay-sdk');
  const appId = requireConfig(config.appId, 'ALIPAY_APP_ID');
  const privateKeyPath = requireConfig(config.privateKeyPath, 'ALIPAY_PRIVATE_KEY_PATH');
  const privateKey = await readFile(privateKeyPath, 'ascii');

  if (config.appCertPath || config.publicCertPath || config.rootCertPath) {
    return new AlipaySdk({
      appId,
      privateKey,
      endpoint: config.gateway,
      appCertPath: config.appCertPath,
      alipayPublicCertPath: config.publicCertPath,
      alipayRootCertPath: config.rootCertPath
    });
  }

  const publicKeyPath = requireConfig(config.publicKeyPath, 'ALIPAY_PUBLIC_KEY_PATH');
  const alipayPublicKey = await readFile(publicKeyPath, 'ascii');

  return new AlipaySdk({
    appId,
    privateKey,
    alipayPublicKey,
    endpoint: config.gateway
  });
}

export async function createAlipayPagePayment(config: AlipayConfig, args: CreateAlipayPaymentArgs) {
  const sdk = await createAlipaySdk(config);

  return sdk.pageExecute('alipay.trade.page.pay', 'GET', {
    bizContent: {
      out_trade_no: args.outTradeNo,
      product_code: 'FAST_INSTANT_TRADE_PAY',
      subject: args.subject,
      body: args.body,
      total_amount: args.totalAmount
    },
    returnUrl: config.returnUrl,
    notifyUrl: config.notifyUrl
  });
}

export async function verifyAlipayNotify(config: AlipayConfig, postData: Record<string, unknown>) {
  const sdk = await createAlipaySdk(config);
  return sdk.checkNotifySign(postData);
}
