# Domain Context

## Why settlement operations exist

A payment accepted from a customer is not identical to the money that eventually appears in a merchant bank account. Settlement operations connect payment activity to net settlement amounts through fees, taxes, refunds, adjustments, timing and bank-side records.

## Core domain terms

**Order:** merchant-side commercial record for a customer purchase.

**Payment:** payment transaction associated with an order.

**Capture:** confirmation that a payment is captured for subsequent settlement processing.

**Fee:** processing charge attributable to a payment or settlement context.

**Tax on fee:** tax amount associated with an applicable fee in the synthetic model.

**Refund:** a return/reversal of customer payment value.

**Adjustment:** a settlement-side financial amount that changes expected net settlement and is not represented as an ordinary customer payment.

**Settlement:** a financial representation of captured value becoming payable/credited to a merchant after applicable deductions and adjustments.

**Settlement line:** an individual amount contributing to a settlement batch.

**UTR:** a simulated bank/payment reference used to connect settlement movements to bank-credit records.

**Bank credit:** the simulated bank-side record representing a credited amount.

**Ledger entry:** the merchant-side accounting representation of expected or recorded financial value.

**Invoice / fee statement:** a period-level source record describing applicable fees and taxes.

**Reconciliation:** comparing records from multiple sources, establishing correspondence, and verifying expected amounts.

**Exception:** a persistent case that deterministic first-pass logic cannot safely close.

## Lifecycle model

A simplified lifecycle is:

```text
Order
  -> Payment
  -> Capture
  -> Fee/Tax
  -> Refund/Adjustment (optional)
  -> Settlement
  -> Bank Credit
  -> Ledger
  -> Reconciliation
```

The exact graph may branch. For example, one order can contribute to multiple settlement lines or one settlement can contain multiple payment-derived lines.

## Why semantic interpretation matters

A discrepancy amount alone is often insufficient to explain its cause. A ₹295 variance could arise from a ₹250 fee and ₹45 tax, from a split/UTR allocation, from refund netting, or from an adjustment. The evidence required to discriminate between these explanations may live in different source records and different time windows.

## Domain boundary

The MVP uses generic payment-gateway concepts and controlled synthetic assumptions. It does not claim to reproduce Razorpay's private internal settlement engine.

## Public Razorpay relevance

Razorpay documentation publicly describes settlements as the process of settling money received from customers to a merchant bank account and provides settlement-reconciliation APIs that expose records such as payments, refunds, transfers and adjustments. These public capabilities establish domain relevance but are not instructions to reproduce a private internal implementation. [Razorpay settlement docs](https://razorpay.com/docs/payments/settlements/); [Settlement Recon API](https://razorpay.com/docs/api/settlements/fetch-recon/).
