INSERT INTO estados (nome)
SELECT estado.nome
FROM (
  SELECT 'Acre' AS nome
  UNION ALL SELECT 'Alagoas'
  UNION ALL SELECT 'Amapá'
  UNION ALL SELECT 'Amazonas'
  UNION ALL SELECT 'Bahia'
  UNION ALL SELECT 'Ceará'
  UNION ALL SELECT 'Distrito Federal'
  UNION ALL SELECT 'Espírito Santo'
  UNION ALL SELECT 'Goiás'
  UNION ALL SELECT 'Maranhão'
  UNION ALL SELECT 'Mato Grosso'
  UNION ALL SELECT 'Mato Grosso do Sul'
  UNION ALL SELECT 'Minas Gerais'
  UNION ALL SELECT 'Pará'
  UNION ALL SELECT 'Paraíba'
  UNION ALL SELECT 'Paraná'
  UNION ALL SELECT 'Pernambuco'
  UNION ALL SELECT 'Piauí'
  UNION ALL SELECT 'Rio de Janeiro'
  UNION ALL SELECT 'Rio Grande do Norte'
  UNION ALL SELECT 'Rio Grande do Sul'
  UNION ALL SELECT 'Rondônia'
  UNION ALL SELECT 'Roraima'
  UNION ALL SELECT 'Santa Catarina'
  UNION ALL SELECT 'São Paulo'
  UNION ALL SELECT 'Sergipe'
  UNION ALL SELECT 'Tocantins'
) AS estado
WHERE NOT EXISTS (
  SELECT 1
  FROM estados existente
  WHERE existente.nome = estado.nome
);
