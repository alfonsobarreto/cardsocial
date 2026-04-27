# Coins and Diamonds Economy Plan

## Decision

Card-Social will use two wallet balances:

- **CS Coins**: rewarded currency granted by the platform through subscriptions, cashback, QR gifts, campaigns, or bonuses.
- **Diamonds**: purchased currency funded directly by the user through real-money top-ups.

This keeps gifted value separate from purchased value while allowing both balances to pay for the same marketplace products.

## Exchange Rates

- `100 CS Coins = $1 USD`
- `1 Diamond = $1 USD`

Example marketplace price:

- A `$5 USD` theme can cost `500 CS Coins` or `5 Diamonds`.

## Spend Policy

The app will always spend **CS Coins first** automatically. If the user does not have enough CS Coins for the full purchase, the remaining value can be paid with Diamonds.

Refunds return value in the same currency that was used for the original purchase.

## Expiration

- CS Coins expire after `12 months`.
- Diamonds never expire.

## Top-Ups

Diamond top-ups will use RevenueCat with standard packages:

- `10 Diamonds`
- `50 Diamonds`
- `100 Diamonds`

## Migration

All existing `creditsBalance` values will migrate to CS Coins. Diamonds will start at `0` for every user.

This is the safest migration path because current balances were not reliably split by source.

## Admin Web Ownership

The Heroku `admin-web` panel will become the source of truth for marketplace pricing. The Pricing CMS will control product prices for themes, icons, typography, business cards, and other paid assets.

## Current Scope

This document closes the product decision for now. No mobile wallet refactor should happen until the Admin Web modules are stable and the migration plan is scheduled as its own implementation phase.
