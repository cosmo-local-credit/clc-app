# Troubleshooting

## Rebasing pool pricing changes

When an older pool feature branch conflicts with current pricing code, preserve the
current creation model: new pools support `oracle` or `decimal` pricing only.
`relative` remains in the wider read model solely for legacy pools. Units without
an oracle feed, including BAM, must switch to `decimal` and the deploy payload must
still carry `unitOfAccount`.

See also [[Pool Pricing]] and [[Unit of Account]].
