begin;

-- Permite que usuários ativos gerem novamente apenas os itens das próprias
-- contas. Administradores continuam podendo gerar itens de qualquer usuário.
create or replace function public.generate_charge_items(p_charge_id uuid)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_charge public.charges%rowtype;
  v_invoice_id uuid;
  v_month date;
  v_end_month date;
  v_index integer;
  v_base_amount bigint;
  v_remainder bigint;
  v_item_amount bigint;
  v_affected_rows integer;
  v_inserted_items integer := 0;
begin
  select *
  into v_charge
  from public.charges
  where id = p_charge_id;

  if not found then
    raise exception 'A conta informada não existe.';
  end if;

  if not public.is_admin()
    and (
      not public.is_active_user()
      or v_charge.user_id is distinct from auth.uid()
    ) then
    raise exception 'Você só pode gerar cobranças das suas próprias contas.'
      using errcode = '42501';
  end if;

  if not v_charge.active then
    raise exception 'A conta está inativa.';
  end if;

  if v_charge.type = 'variable' then
    insert into public.invoices (
      card_id,
      invoice_month
    )
    values (
      v_charge.card_id,
      v_charge.first_invoice_month
    )
    on conflict (
      card_id,
      invoice_month
    )
    do nothing;

    select id
    into v_invoice_id
    from public.invoices
    where card_id = v_charge.card_id
      and invoice_month = v_charge.first_invoice_month;

    insert into public.invoice_items (
      invoice_id,
      charge_id,
      user_id,
      amount_cents
    )
    values (
      v_invoice_id,
      v_charge.id,
      v_charge.user_id,
      v_charge.amount_cents
    )
    on conflict (
      charge_id,
      invoice_id
    )
    do nothing;

    get diagnostics v_affected_rows = row_count;
    v_inserted_items := v_inserted_items + v_affected_rows;
  end if;

  if v_charge.type = 'installment' then
    v_base_amount :=
      v_charge.amount_cents / v_charge.installment_count;
    v_remainder :=
      v_charge.amount_cents % v_charge.installment_count;

    for v_index in 0..(v_charge.installment_count - 1)
    loop
      v_month := (
        v_charge.first_invoice_month
        + make_interval(months => v_index)
      )::date;

      v_item_amount :=
        v_base_amount
        + case when v_index < v_remainder then 1 else 0 end;

      insert into public.invoices (
        card_id,
        invoice_month
      )
      values (
        v_charge.card_id,
        v_month
      )
      on conflict (
        card_id,
        invoice_month
      )
      do nothing;

      select id
      into v_invoice_id
      from public.invoices
      where card_id = v_charge.card_id
        and invoice_month = v_month;

      insert into public.invoice_items (
        invoice_id,
        charge_id,
        user_id,
        amount_cents,
        installment_number,
        installment_total
      )
      values (
        v_invoice_id,
        v_charge.id,
        v_charge.user_id,
        v_item_amount,
        v_index + 1,
        v_charge.installment_count
      )
      on conflict (
        charge_id,
        invoice_id
      )
      do nothing;

      get diagnostics v_affected_rows = row_count;
      v_inserted_items := v_inserted_items + v_affected_rows;
    end loop;
  end if;

  if v_charge.type = 'fixed' then
    v_end_month := (
      v_charge.first_invoice_month + interval '11 months'
    )::date;

    if v_charge.end_invoice_month is not null then
      v_end_month := least(v_end_month, v_charge.end_invoice_month);
    end if;

    v_month := v_charge.first_invoice_month;

    while v_month <= v_end_month loop
      insert into public.invoices (
        card_id,
        invoice_month
      )
      values (
        v_charge.card_id,
        v_month
      )
      on conflict (
        card_id,
        invoice_month
      )
      do nothing;

      select id
      into v_invoice_id
      from public.invoices
      where card_id = v_charge.card_id
        and invoice_month = v_month;

      insert into public.invoice_items (
        invoice_id,
        charge_id,
        user_id,
        amount_cents
      )
      values (
        v_invoice_id,
        v_charge.id,
        v_charge.user_id,
        v_charge.amount_cents
      )
      on conflict (
        charge_id,
        invoice_id
      )
      do nothing;

      get diagnostics v_affected_rows = row_count;
      v_inserted_items := v_inserted_items + v_affected_rows;
      v_month := (v_month + interval '1 month')::date;
    end loop;
  end if;

  return v_inserted_items;
end;
$function$;

-- O administrador renova todas as contas fixas. Um usuário comum renova
-- somente as próprias contas fixas.
create or replace function public.ensure_fixed_charge_items(p_until_month date)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_charge record;
  v_month date;
  v_end_month date;
  v_invoice_id uuid;
  v_affected_rows integer;
  v_inserted_items integer := 0;
  v_is_admin boolean := public.is_admin();
begin
  if not v_is_admin and not public.is_active_user() then
    raise exception 'Somente usuários ativos podem gerar contas fixas.'
      using errcode = '42501';
  end if;

  if p_until_month is null then
    raise exception 'O mês final é obrigatório.';
  end if;

  if date_trunc('month', p_until_month)::date <> p_until_month then
    raise exception 'O mês final deve ser o primeiro dia do mês.';
  end if;

  for v_charge in
    select
      charges.id,
      charges.user_id,
      charges.card_id,
      charges.amount_cents,
      charges.first_invoice_month,
      charges.end_invoice_month
    from public.charges
    where charges.type = 'fixed'
      and charges.active = true
      and charges.first_invoice_month <= p_until_month
      and (v_is_admin or charges.user_id = auth.uid())
  loop
    v_end_month := least(
      p_until_month,
      coalesce(v_charge.end_invoice_month, p_until_month)
    );

    v_month := v_charge.first_invoice_month;

    while v_month <= v_end_month loop
      insert into public.invoices (
        card_id,
        invoice_month
      )
      values (
        v_charge.card_id,
        v_month
      )
      on conflict (
        card_id,
        invoice_month
      )
      do nothing;

      select invoices.id
      into v_invoice_id
      from public.invoices
      where invoices.card_id = v_charge.card_id
        and invoices.invoice_month = v_month;

      insert into public.invoice_items (
        invoice_id,
        charge_id,
        user_id,
        amount_cents,
        installment_number,
        installment_total
      )
      values (
        v_invoice_id,
        v_charge.id,
        v_charge.user_id,
        v_charge.amount_cents,
        null,
        null
      )
      on conflict (
        charge_id,
        invoice_id
      )
      do nothing;

      get diagnostics v_affected_rows = row_count;
      v_inserted_items := v_inserted_items + v_affected_rows;
      v_month := (v_month + interval '1 month')::date;
    end loop;
  end loop;

  return v_inserted_items;
end;
$function$;

create or replace function public.create_charge_with_items(
  p_name text,
  p_user_id uuid,
  p_card_id uuid,
  p_type text,
  p_amount_cents bigint,
  p_first_invoice_month date,
  p_installment_count integer default null,
  p_end_invoice_month date default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_charge_id uuid;
  v_invoice_id uuid;
  v_month date;
  v_index integer;
  v_base_amount bigint;
  v_remainder bigint;
  v_item_amount bigint;
  v_fixed_generation_end date;
  v_is_admin boolean := public.is_admin();
begin
  if not v_is_admin
    and (
      not public.is_active_user()
      or p_user_id is distinct from auth.uid()
    ) then
    raise exception 'Você só pode cadastrar contas para o seu próprio usuário.'
      using errcode = '42501';
  end if;

  if p_name is null or trim(p_name) = '' then
    raise exception 'O nome da conta é obrigatório.';
  end if;

  if char_length(trim(p_name)) > 120 then
    raise exception 'O nome da conta é muito longo.';
  end if;

  if p_type is null
    or p_type not in ('fixed', 'variable', 'installment') then
    raise exception 'O tipo da conta é inválido.';
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'O valor deve ser maior que zero.';
  end if;

  if p_first_invoice_month is null then
    raise exception 'A primeira fatura é obrigatória.';
  end if;

  if date_trunc('month', p_first_invoice_month)::date
    <> p_first_invoice_month then
    raise exception 'A primeira fatura deve ser o primeiro dia do mês.';
  end if;

  if not exists (
    select 1
    from public.profiles
    where profiles.id = p_user_id
      and profiles.active = true
  ) then
    raise exception 'O usuário informado não existe ou está inativo.';
  end if;

  if not exists (
    select 1
    from public.cards
    where cards.id = p_card_id
      and cards.active = true
      and (
        v_is_admin
        or cards.kind = 'credit_card'
        or cards.owner_user_id = auth.uid()
      )
  ) then
    raise exception 'A forma de cobrança não existe ou não está disponível.';
  end if;

  if p_type = 'variable' then
    if p_installment_count is not null then
      raise exception 'Uma conta variável não possui parcelas.';
    end if;

    if p_end_invoice_month is not null then
      raise exception 'Uma conta variável não possui mês final.';
    end if;
  end if;

  if p_type = 'installment' then
    if p_installment_count is null or p_installment_count < 2 then
      raise exception 'Informe pelo menos duas parcelas.';
    end if;

    if p_installment_count > 120 then
      raise exception 'A quantidade máxima é de 120 parcelas.';
    end if;

    if p_amount_cents < p_installment_count then
      raise exception
        'O valor total não pode ser menor que a quantidade de parcelas.';
    end if;

    if p_end_invoice_month is not null then
      raise exception 'O mês final é calculado pelas parcelas.';
    end if;
  end if;

  if p_type = 'fixed' then
    if p_installment_count is not null then
      raise exception 'Uma conta fixa não possui quantidade de parcelas.';
    end if;

    if p_end_invoice_month is not null then
      if date_trunc('month', p_end_invoice_month)::date
        <> p_end_invoice_month then
        raise exception 'O mês final deve ser o primeiro dia do mês.';
      end if;

      if p_end_invoice_month < p_first_invoice_month then
        raise exception 'O mês final não pode ser anterior ao início.';
      end if;
    end if;
  end if;

  insert into public.charges (
    name,
    user_id,
    card_id,
    type,
    amount_cents,
    installment_count,
    first_invoice_month,
    end_invoice_month,
    active,
    created_by
  )
  values (
    trim(p_name),
    p_user_id,
    p_card_id,
    p_type,
    p_amount_cents,
    p_installment_count,
    p_first_invoice_month,
    p_end_invoice_month,
    true,
    auth.uid()
  )
  returning id into v_charge_id;

  if p_type = 'variable' then
    insert into public.invoices (card_id, invoice_month)
    values (p_card_id, p_first_invoice_month)
    on conflict (card_id, invoice_month) do nothing;

    select invoices.id
    into v_invoice_id
    from public.invoices
    where invoices.card_id = p_card_id
      and invoices.invoice_month = p_first_invoice_month;

    insert into public.invoice_items (
      invoice_id,
      charge_id,
      user_id,
      amount_cents
    )
    values (
      v_invoice_id,
      v_charge_id,
      p_user_id,
      p_amount_cents
    );
  end if;

  if p_type = 'installment' then
    v_base_amount := p_amount_cents / p_installment_count;
    v_remainder := p_amount_cents % p_installment_count;

    for v_index in 0..(p_installment_count - 1)
    loop
      v_month := (
        p_first_invoice_month + make_interval(months => v_index)
      )::date;
      v_item_amount :=
        v_base_amount
        + case when v_index < v_remainder then 1 else 0 end;

      insert into public.invoices (card_id, invoice_month)
      values (p_card_id, v_month)
      on conflict (card_id, invoice_month) do nothing;

      select invoices.id
      into v_invoice_id
      from public.invoices
      where invoices.card_id = p_card_id
        and invoices.invoice_month = v_month;

      insert into public.invoice_items (
        invoice_id,
        charge_id,
        user_id,
        amount_cents,
        installment_number,
        installment_total
      )
      values (
        v_invoice_id,
        v_charge_id,
        p_user_id,
        v_item_amount,
        v_index + 1,
        p_installment_count
      );
    end loop;
  end if;

  if p_type = 'fixed' then
    v_fixed_generation_end := (
      p_first_invoice_month + interval '11 months'
    )::date;

    if p_end_invoice_month is not null then
      v_fixed_generation_end := least(
        v_fixed_generation_end,
        p_end_invoice_month
      );
    end if;

    perform public.ensure_fixed_charge_items(v_fixed_generation_end);
  end if;

  return v_charge_id;
end;
$function$;

create or replace function public.update_charge_with_items(
  p_charge_id uuid,
  p_name text,
  p_user_id uuid,
  p_card_id uuid,
  p_type text,
  p_amount_cents bigint,
  p_first_invoice_month date,
  p_installment_count integer default null,
  p_end_invoice_month date default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_current_owner_id uuid;
  v_is_admin boolean := public.is_admin();
begin
  select charges.user_id
  into v_current_owner_id
  from public.charges
  where charges.id = p_charge_id;

  if not found then
    raise exception 'A conta informada não existe.';
  end if;

  if not v_is_admin
    and (
      not public.is_active_user()
      or v_current_owner_id is distinct from auth.uid()
      or p_user_id is distinct from auth.uid()
    ) then
    raise exception 'Você só pode editar suas próprias contas.'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.invoice_items
    join public.invoices
      on invoices.id = invoice_items.invoice_id
    where invoice_items.charge_id = p_charge_id
      and invoices.status = 'paid'
  ) then
    raise exception
      'Esta conta possui faturas pagas e não pode ser editada.';
  end if;

  if p_name is null or trim(p_name) = '' then
    raise exception 'O nome da conta é obrigatório.';
  end if;

  if char_length(trim(p_name)) > 120 then
    raise exception 'O nome da conta é muito longo.';
  end if;

  if p_type is null
    or p_type not in ('fixed', 'variable', 'installment') then
    raise exception 'O tipo da conta é inválido.';
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'O valor deve ser maior que zero.';
  end if;

  if p_first_invoice_month is null
    or date_trunc('month', p_first_invoice_month)::date
      <> p_first_invoice_month then
    raise exception 'A primeira fatura deve ser um mês válido.';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = p_user_id
      and active = true
  ) then
    raise exception 'O usuário não existe ou está inativo.';
  end if;

  if not exists (
    select 1
    from public.cards
    where id = p_card_id
      and active = true
      and (
        v_is_admin
        or kind = 'credit_card'
        or owner_user_id = auth.uid()
      )
  ) then
    raise exception 'A forma de cobrança não existe ou não está disponível.';
  end if;

  if p_type = 'variable'
    and (
      p_installment_count is not null
      or p_end_invoice_month is not null
    ) then
    raise exception
      'Uma conta variável não possui parcelas ou mês final.';
  end if;

  if p_type = 'installment' then
    if p_installment_count is null or p_installment_count < 2 then
      raise exception 'Informe pelo menos duas parcelas.';
    end if;

    if p_installment_count > 120 then
      raise exception 'A quantidade máxima é de 120 parcelas.';
    end if;

    if p_amount_cents < p_installment_count then
      raise exception 'O valor é menor que a quantidade de parcelas.';
    end if;

    if p_end_invoice_month is not null then
      raise exception 'Uma conta parcelada não possui mês final.';
    end if;
  end if;

  if p_type = 'fixed' then
    if p_installment_count is not null then
      raise exception 'Uma conta fixa não possui parcelas.';
    end if;

    if p_end_invoice_month is not null
      and (
        date_trunc('month', p_end_invoice_month)::date
          <> p_end_invoice_month
        or p_end_invoice_month < p_first_invoice_month
      ) then
      raise exception 'O mês final é inválido.';
    end if;
  end if;

  delete from public.invoice_items
  using public.invoices
  where invoice_items.invoice_id = invoices.id
    and invoice_items.charge_id = p_charge_id
    and invoices.status = 'open';

  update public.charges
  set
    name = trim(p_name),
    user_id = p_user_id,
    card_id = p_card_id,
    type = p_type,
    amount_cents = p_amount_cents,
    installment_count = case
      when p_type = 'installment' then p_installment_count
      else null
    end,
    first_invoice_month = p_first_invoice_month,
    end_invoice_month = case
      when p_type = 'fixed' then p_end_invoice_month
      else null
    end,
    active = true
  where id = p_charge_id;

  perform public.generate_charge_items(p_charge_id);

  delete from public.invoices
  where status = 'open'
    and not exists (
      select 1
      from public.invoice_items
      where invoice_items.invoice_id = invoices.id
    );

  return p_charge_id;
end;
$function$;

create or replace function public.remove_charge(p_charge_id uuid)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_owner_id uuid;
begin
  select charges.user_id
  into v_owner_id
  from public.charges
  where id = p_charge_id;

  if not found then
    raise exception 'A conta informada não existe.';
  end if;

  if not public.is_admin()
    and (
      not public.is_active_user()
      or v_owner_id is distinct from auth.uid()
    ) then
    raise exception 'Você só pode remover suas próprias contas.'
      using errcode = '42501';
  end if;

  delete from public.invoice_items
  using public.invoices
  where invoice_items.invoice_id = invoices.id
    and invoice_items.charge_id = p_charge_id
    and invoices.status = 'open';

  update public.charges
  set active = false
  where id = p_charge_id;

  delete from public.invoices
  where status = 'open'
    and not exists (
      select 1
      from public.invoice_items
      where invoice_items.invoice_id = invoices.id
    );

  return true;
end;
$function$;

-- As tabelas continuam com escrita direta exclusiva para administradores.
-- Usuários comuns escrevem somente pelas funções acima, que validam auth.uid().
revoke all on function public.create_charge_with_items(
  text, uuid, uuid, text, bigint, date, integer, date
) from public, anon;
revoke all on function public.update_charge_with_items(
  uuid, text, uuid, uuid, text, bigint, date, integer, date
) from public, anon;
revoke all on function public.remove_charge(uuid) from public, anon;
revoke all on function public.generate_charge_items(uuid) from public, anon;
revoke all on function public.ensure_fixed_charge_items(date) from public, anon;

grant execute on function public.create_charge_with_items(
  text, uuid, uuid, text, bigint, date, integer, date
) to authenticated;
grant execute on function public.update_charge_with_items(
  uuid, text, uuid, uuid, text, bigint, date, integer, date
) to authenticated;
grant execute on function public.remove_charge(uuid) to authenticated;
grant execute on function public.generate_charge_items(uuid) to authenticated;
grant execute on function public.ensure_fixed_charge_items(date) to authenticated;

commit;
