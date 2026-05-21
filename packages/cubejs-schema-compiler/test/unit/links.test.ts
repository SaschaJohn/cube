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
          - name: google_search
            label: Search on Google
            url: "{full_name}"
            icon: brand-google
            target: blank
          - name: send_email
            label: Write an email
            url: "{email}"
            icon: send

      - name: email
        sql: email
        type: string
`;

  it('should create synthetic link URL dimensions', async () => {
    const compilers = prepareYamlCompiler(schemaWithLinks);
    await compilers.compiler.compile();

    const googleDef = compilers.cubeEvaluator.dimensionByPath('users.full_name___link_google_search_url');
    expect(googleDef).toBeDefined();
    expect(googleDef.type).toBe('string');
    expect((googleDef as any).synthetic).toBe(true);

    const emailDef = compilers.cubeEvaluator.dimensionByPath('users.full_name___link_send_email_url');
    expect(emailDef).toBeDefined();
    expect(emailDef.type).toBe('string');
    expect((emailDef as any).synthetic).toBe(true);
  });

  it('synthetic link dimension exists and can be referenced', async () => {
    const compilers = prepareYamlCompiler(schemaWithLinks);
    await compilers.compiler.compile();

    const dimDef = compilers.cubeEvaluator.dimensionByPath('users.full_name___link_google_search_url');
    expect(dimDef).toBeDefined();
    expect(dimDef.type).toBe('string');
    expect(typeof dimDef.sql).toBe('function');
  });

  it('should NOT include link URL columns unless explicitly queried', async () => {
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

  it('should expose links metadata and synthetic flag in meta config', async () => {
    const compilers = prepareYamlCompiler(schemaWithLinks);
    await compilers.compiler.compile();

    const { metaTransformer } = compilers;
    const { cubes } = metaTransformer;
    const usersCube = cubes.find((c: any) => c.config.name === 'users');
    expect(usersCube).toBeDefined();

    const fullNameDim = usersCube!.config.dimensions.find(
      (d: any) => d.name === 'users.full_name'
    );
    expect(fullNameDim).toBeDefined();
    expect(fullNameDim!.links).toBeDefined();
    expect(fullNameDim!.links).toHaveLength(2);
    expect(fullNameDim!.links![0].label).toBe('Search on Google');
    expect(fullNameDim!.links![0].icon).toBe('brand-google');
    expect(fullNameDim!.links![0].target).toBe('blank');

    const syntheticDim = usersCube!.config.dimensions.find(
      (d: any) => d.name === 'users.full_name___link_google_search_url'
    );
    expect(syntheticDim).toBeDefined();
    expect(syntheticDim!.synthetic).toBe(true);
  });

  it('synthetic link dimensions should be public by default', async () => {
    const compilers = prepareYamlCompiler(schemaWithLinks);
    await compilers.compiler.compile();

    const { metaTransformer } = compilers;
    const { cubes } = metaTransformer;
    const usersCube = cubes.find((c: any) => c.config.name === 'users');
    expect(usersCube).toBeDefined();

    const syntheticDim = usersCube!.config.dimensions.find(
      (d: any) => d.name === 'users.full_name___link_google_search_url'
    );
    expect(syntheticDim).toBeDefined();
    expect(syntheticDim!.public).toBe(true);
  });

  it('should validate links schema - label is required', async () => {
    const invalidSchema = `
cubes:
  - name: users
    sql_table: users

    dimensions:
      - name: full_name
        sql: full_name
        type: string
        links:
          - name: test
            url: "{full_name}"
`;
    const compilers = prepareYamlCompiler(invalidSchema);

    try {
      await compilers.compiler.compile();
      fail('Should have thrown an error for missing label');
    } catch (e: any) {
      expect(e.message || e.toString()).toMatch(/label/i);
    }
  });

  describe('access policy on view with links', () => {
    const schemaWithViewAndPolicy = `
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
          - name: google_search
            label: Search on Google
            url: "{full_name}"
            icon: brand-google

      - name: email
        sql: email
        type: string

views:
  - name: users_view
    cubes:
      - join_path: users
        includes:
          - full_name
          - email
    access_policy:
      - role: "*"
        member_level:
          includes:
            - full_name
            - full_name___link_google_search_url
`;

    it('should include synthetic link dim when explicitly listed in access policy', async () => {
      const compilers = prepareYamlCompiler(schemaWithViewAndPolicy);
      await compilers.compiler.compile();

      const viewCube = compilers.cubeEvaluator.cubeFromPath('users_view');
      expect(viewCube).toBeDefined();

      const policy = viewCube.accessPolicy[0];
      expect(policy.memberLevel.includesMembers).toContain('users_view.full_name');
      expect(policy.memberLevel.includesMembers).toContain('users_view.full_name___link_google_search_url');
    });

    const schemaWithViewPolicyExcludeLink = `
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
          - name: google_search
            label: Search on Google
            url: "{full_name}"
            icon: brand-google

      - name: email
        sql: email
        type: string

views:
  - name: users_view
    cubes:
      - join_path: users
        includes:
          - full_name
          - email
    access_policy:
      - role: "*"
        member_level:
          includes:
            - full_name
            - email
`;

    it('should exclude synthetic link dim when not listed in access policy includes', async () => {
      const compilers = prepareYamlCompiler(schemaWithViewPolicyExcludeLink);
      await compilers.compiler.compile();

      const viewCube = compilers.cubeEvaluator.cubeFromPath('users_view');
      expect(viewCube).toBeDefined();

      const policy = viewCube.accessPolicy[0];
      expect(policy.memberLevel.includesMembers).toContain('users_view.full_name');
      expect(policy.memberLevel.includesMembers).toContain('users_view.email');
      expect(policy.memberLevel.includesMembers).not.toContain('users_view.full_name___link_google_search_url');
    });

    const schemaWithViewPolicyWildcard = `
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
          - name: google_search
            label: Search on Google
            url: "{full_name}"
            icon: brand-google

      - name: email
        sql: email
        type: string

views:
  - name: users_view
    cubes:
      - join_path: users
        includes: "*"
    access_policy:
      - role: "*"
        member_level:
          includes: "*"
`;

    it('should include synthetic link dim when access policy uses wildcard includes', async () => {
      const compilers = prepareYamlCompiler(schemaWithViewPolicyWildcard);
      await compilers.compiler.compile();

      const viewCube = compilers.cubeEvaluator.cubeFromPath('users_view');
      expect(viewCube).toBeDefined();

      const policy = viewCube.accessPolicy[0];
      expect(policy.memberLevel.includesMembers).toContain('users_view.full_name___link_google_search_url');
    });
  });
});
