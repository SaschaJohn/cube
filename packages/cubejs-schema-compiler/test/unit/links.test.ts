import { PostgresQuery } from '../../src';
import { prepareYamlCompiler } from './PrepareCompiler';

describe('Links', () => {
  const schemaWithLinks = `
cubes:
  - name: users
    sql_table: users

    dimensions:
      - name: id
        sql: id
        type: number
        primary_key: true

      - name: full_name
        sql: full_name
        type: string
        links:
          - label: Search on Google
            url: "https://www.google.com/search?q={full_name}"
            icon: brand-google
            target: blank
          - label: Write an email
            url: "mailto:{email}"
            icon: send

      - name: email
        sql: email
        type: string
`;

  it('should include link URL columns when includeLinks is true', async () => {
    const compilers = prepareYamlCompiler(schemaWithLinks);
    await compilers.compiler.compile();

    const query = new PostgresQuery(compilers, {
      measures: [],
      dimensions: ['users.full_name'],
      includeLinks: true,
    });

    const queryAndParams = query.buildSqlAndParams();
    const sql = queryAndParams[0];

    expect(sql).toContain('users__full_name___link_0_url');
    expect(sql).toContain('users__full_name___link_1_url');
    expect(sql).toContain('https://www.google.com/search?q=');
    expect(sql).toContain('mailto:');
  });

  it('should NOT include link URL columns when includeLinks is false or absent', async () => {
    const compilers = prepareYamlCompiler(schemaWithLinks);
    await compilers.compiler.compile();

    const query = new PostgresQuery(compilers, {
      measures: [],
      dimensions: ['users.full_name'],
    });

    const queryAndParams = query.buildSqlAndParams();
    const sql = queryAndParams[0];

    expect(sql).not.toContain('___link_');
  });

  it('should resolve dimension references in link URL templates', async () => {
    const compilers = prepareYamlCompiler(schemaWithLinks);
    await compilers.compiler.compile();

    const query = new PostgresQuery(compilers, {
      measures: [],
      dimensions: ['users.full_name'],
      includeLinks: true,
    });

    const queryAndParams = query.buildSqlAndParams();
    const sql = queryAndParams[0];

    // The {full_name} reference should be resolved to the SQL for the full_name dimension
    expect(sql).toContain('"users".full_name');
    // The {email} reference should be resolved to the SQL for the email dimension
    expect(sql).toContain('"users".email');
  });

  it('should expose links in meta config', async () => {
    const compilers = prepareYamlCompiler(schemaWithLinks);
    await compilers.compiler.compile();

    const metaTransformer = compilers.metaTransformer;
    const cubes = metaTransformer.cubes;
    const usersCube = cubes.find((c: any) => c.config.name === 'users');
    expect(usersCube).toBeDefined();
    const fullNameDim = usersCube!.config.dimensions.find(
      (d: any) => d.name === 'users.full_name'
    );

    expect(fullNameDim).toBeDefined();
    expect(fullNameDim!.links).toBeDefined();
    expect(fullNameDim!.links).toHaveLength(2);
    expect(fullNameDim!.links![0].label).toBe('Search on Google');
    expect(fullNameDim!.links![0].url).toBe('https://www.google.com/search?q={full_name}');
    expect(fullNameDim!.links![0].icon).toBe('brand-google');
    expect(fullNameDim!.links![0].target).toBe('blank');
    expect(fullNameDim!.links![1].label).toBe('Write an email');
    expect(fullNameDim!.links![1].url).toBe('mailto:{email}');
    expect(fullNameDim!.links![1].icon).toBe('send');
    expect(fullNameDim!.links![1].target).toBe('blank');
  });

  it('should default target to blank and propagate_filters_to_params to true', async () => {
    const compilers = prepareYamlCompiler(schemaWithLinks);
    await compilers.compiler.compile();

    const metaTransformer = compilers.metaTransformer;
    const cubes = metaTransformer.cubes;
    const usersCube = cubes.find((c: any) => c.config.name === 'users');
    expect(usersCube).toBeDefined();
    const fullNameDim = usersCube!.config.dimensions.find(
      (d: any) => d.name === 'users.full_name'
    );

    expect(fullNameDim).toBeDefined();
    expect(fullNameDim!.links![0].propagate_filters_to_params).toBe(true);
    expect(fullNameDim!.links![0].param_name_for_filters).toBe('filters');
  });

  it('should validate links schema', async () => {
    const invalidSchema = `
cubes:
  - name: users
    sql_table: users

    dimensions:
      - name: full_name
        sql: full_name
        type: string
        links:
          - url: "https://example.com"
`;
    const compilers = prepareYamlCompiler(invalidSchema);

    try {
      await compilers.compiler.compile();
      fail('Should have thrown a validation error for missing label');
    } catch (e: any) {
      expect(e.message || e.toString()).toContain('label');
    }
  });
});
