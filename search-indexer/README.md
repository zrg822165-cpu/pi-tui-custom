# Search Indexer

Owns file search execution behind a replaceable interface.

- text search through ripgrep-compatible semantics
- file discovery through fd-compatible semantics
- directory listing through filesystem operations
- path normalization through `SearchPathAdapter`
- filesystem access through `SearchFsAdapter`
- grep context rendering through `SearchContextFormatter`
- rg/fd argument construction through `SearchQueryBuilder`
- process execution through `SearchProcessAdapter`
- truncation/details formatting through `SearchResultFormatter`
- lifecycle hooks reserved for a future persistent Rust indexer
