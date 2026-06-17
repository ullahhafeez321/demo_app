create extension if not exists vector;

create table if not exists documents (
  document_id text primary key,
  project_id text not null,
  file_name text not null,
  mime_type text not null,
  size integer not null,
  page_count integer,
  extracted_text_length integer not null,
  text_preview text not null,
  created_at timestamptz not null default now()
);

create table if not exists document_chunks (
  chunk_id text primary key,
  project_id text not null,
  document_id text not null references documents(document_id) on delete cascade,
  file_name text not null,
  chunk_index integer not null,
  text text not null,
  start_offset integer not null,
  end_offset integer not null,
  embedding vector(1536) not null,
  embedding_provider text not null,
  embedding_model text not null,
  created_at timestamptz not null default now()
);

create index if not exists document_chunks_project_id_idx on document_chunks(project_id);
create index if not exists document_chunks_document_id_idx on document_chunks(document_id);
create index if not exists document_chunks_embedding_idx
  on document_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

create or replace function match_document_chunks(
  query_embedding vector(1536),
  match_project_id text,
  match_count integer default 5
)
returns table (
  document_id text,
  chunk_id text,
  file_name text,
  chunk_index integer,
  text text,
  similarity double precision
)
language sql stable
as $$
  select
    document_chunks.document_id,
    document_chunks.chunk_id,
    document_chunks.file_name,
    document_chunks.chunk_index,
    document_chunks.text,
    1 - (document_chunks.embedding <=> query_embedding) as similarity
  from document_chunks
  where document_chunks.project_id = match_project_id
  order by document_chunks.embedding <=> query_embedding
  limit match_count;
$$;
