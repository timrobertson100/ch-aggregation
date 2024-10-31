package org.gbif.ch;

import com.clickhouse.client.api.Client;
import com.clickhouse.client.api.data_formats.ClickHouseBinaryFormatReader;
import com.clickhouse.client.api.query.QueryResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.concurrent.TimeUnit;

@RestController
public class MercatorController {

  @GetMapping("/mercator")
  public String index(@RequestParam("z") int z, @RequestParam("x") int x, @RequestParam("y") int y) {

    Client client = new Client.Builder()
        .addEndpoint("http://scrap-vh.gbif-dev.org:8123/?param_z=" + (z-2) + "&param_x=" + x + "&param_y=" + y)
        .setUsername("default")
        .setPassword("clickhouse")
        .build();

    final String sql = "WITH\n" +
        "    bitShiftLeft(1::UInt64, {z:UInt8}) AS zoom_factor,\n" +
        "    bitShiftLeft(1::UInt64, 32 - {z:UInt8}) AS tile_size,\n" +
        "    tile_size * {x:UInt16} AS tile_x_begin,\n" +
        "    tile_size * ({x:UInt16} + 1) AS tile_x_end,\n" +
        "    tile_size * {y:UInt16} AS tile_y_begin,\n" +
        "    tile_size * ({y:UInt16} + 1) AS tile_y_end,\n" +
        "    mercator_x >= tile_x_begin AND mercator_x < tile_x_end\n" +
        "    AND mercator_y >= tile_y_begin AND mercator_y < tile_y_end AS in_tile,\n" +
        "    bitShiftRight(mercator_x - tile_x_begin, 32 - 10 - {z:UInt8}) AS x,\n" +
        "    bitShiftRight(mercator_y - tile_y_begin, 32 - 10 - {z:UInt8}) AS y,\n" +
        "    y * 1024 + x AS pos,\n" +
        "    255 AS alpha,\n" +
        "    255 AS red,\n" +
        "    100 AS green,\n" +
        "    100 AS blue\n" + "SELECT round(red)::UInt8, round(green)::UInt8, round(blue)::UInt8, round(alpha)::UInt8\n" +
        "FROM gbif_mercator\n" +
        "WHERE in_tile\n" +
        "GROUP BY pos ORDER BY pos WITH FILL FROM 0 TO 1024*1024";

    try (QueryResponse response = client.query(sql).get(100, TimeUnit.SECONDS);) {
      ClickHouseBinaryFormatReader reader = client.newBinaryFormatReader(response);

      StringBuffer sb = new StringBuffer();

      while (reader.hasNext()) {
        reader.next(); // Read the next record from stream and parse it

        sb.append(reader.getString("id")  );
        sb.append('|');
        sb.append(reader.getLong("occcount")  );
        if (reader.hasNext()) sb.append(",");

      }
      return sb.toString();
    } catch (Exception e) {
      e.printStackTrace();
      return e.getMessage();
    }
  }

}
