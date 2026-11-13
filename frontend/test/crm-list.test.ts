import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCrmListQuery,
  CRM_LIST_PAGE_SIZE,
  crmApiErrorMessage,
} from '../src/lib/crm-list';

test('CRM lookup list queries stay within DTO page bounds and use valid inquiry sorting', () => {
  for (const module of [
    'companies',
    'opportunities',
    'inquiries',
    'contacts',
  ]) {
    const query = buildCrmListQuery({ page: 1, module });
    assert.equal(Number(query.get('pageSize')), CRM_LIST_PAGE_SIZE);
    assert.ok(Number(query.get('pageSize')) >= 1);
    assert.ok(Number(query.get('pageSize')) <= 100);
  }
  const inquiry = buildCrmListQuery({
    page: 1,
    module: 'inquiries',
    sort: 'createdAt:desc',
  });
  assert.equal(inquiry.get('sortBy'), 'createdAt');
  assert.equal(inquiry.get('sortDirection'), 'desc');
});

test('CRM list query bounds search and ignores invalid country codes and sort options', () => {
  const query = buildCrmListQuery({
    page: 0,
    module: 'companies',
    search: 'x'.repeat(150),
    countryCode: '1!',
  });
  assert.equal(query.get('page'), '1');
  assert.equal(query.get('q')?.length, 120);
  assert.equal(query.has('countryCode'), false);

  const invalidStatus = buildCrmListQuery({
    page: Number.NaN,
    module: 'inquiries',
    status: '',
  });
  assert.equal(invalidStatus.get('page'), '1');
  assert.equal(invalidStatus.has('status'), false);
  assert.equal(invalidStatus.has('q'), false);

  const invalidSort = buildCrmListQuery({
    page: 1,
    module: 'inquiries',
    sort: 'company:up',
  });
  assert.equal(invalidSort.has('sortBy'), false);
  assert.equal(invalidSort.has('sortDirection'), false);
});

test('CRM API errors explain disabled storage and list validation distinctly', () => {
  assert.equal(
    crmApiErrorMessage(503, 'list'),
    'El almacenamiento del CRM aún no está habilitado.',
  );
  assert.equal(
    crmApiErrorMessage(400, 'list'),
    'Los filtros o las opciones de orden de la lista no son válidos.',
  );
  assert.equal(
    crmApiErrorMessage(400, 'write'),
    'Los datos enviados no cumplen el formato requerido.',
  );
  assert.equal(
    crmApiErrorMessage(400, 'list', ['pageSize', 'status', 'notAllowed']),
    'Revisa estos filtros: tamaño de página, estado.',
  );
});
