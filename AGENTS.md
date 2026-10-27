# Architecture rules
- GoHighLevel order contact synchronization uses a database outbox and authenticated one-time delivery nonces, so checkout is independent of provider availability.
- GoHighLevel sync reads explicit profile/subscriber consent, not automatically subscribed marketing contact rows; only consented channel identifiers are sent and existing GoHighLevel tags/opt-outs are not reset.